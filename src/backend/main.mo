import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";
import AccessControl "authorization/access-control";
import UserApproval "user-approval/approval";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Nat "mo:core/Nat";



actor {
  let storage = Storage.new();
  include MixinStorage(storage);

  let accessControlState = AccessControl.initState();
  let approvalState = UserApproval.initState(accessControlState);

  let userProfiles = Map.empty<Principal, UserProfile>();
  var frontendCanisterId : Text = "";
  var backendCanisterId : Text = "";
  var firstAdmin : ?Principal = null;

  let appVersion = "0.1.60";

  type FileMetadata = {
    id : Text;
    name : Text;
    size : Nat;
    blob : Storage.ExternalBlob;
    parentId : ?Text;
  };

  type FolderMetadata = {
    id : Text;
    name : Text;
    parentId : ?Text;
  };

  public type AdminInfo = {
    principal : Principal;
    username : Text;
    role : AccessControl.UserRole;
  };

  public type StorageStats = {
    totalStorageBytes : Nat;
    backendCanisterId : Text;
    frontendCanisterId : Text;
    appVersion : Text;
  };

  public type FileSystemItem = {
    #file : FileMetadata;
    #folder : FolderMetadata;
  };

  public type FileMove = {
    id : Text;
    newParentId : ?Text;
    isFolder : Bool;
  };

  var nextFolderId = 1;

  let files = Map.empty<Text, FileMetadata>();
  let folders = Map.empty<Text, FolderMetadata>();

  public type UserProfile = {
    name : Text;
  };

  public shared ({ caller }) func initializeAccessControl() : async () {
    AccessControl.initialize(accessControlState, caller);
    switch (firstAdmin) {
      case (null) { firstAdmin := ?caller };
      case (?_) {};
    };
  };

  // Approval Functions
  public query ({ caller }) func isCallerApproved() : async Bool {
    AccessControl.hasPermission(accessControlState, caller, #admin) or UserApproval.isApproved(approvalState, caller);
  };

  public shared ({ caller }) func requestApproval() : async () {
    UserApproval.requestApproval(approvalState, caller : Principal);
  };

  public shared ({ caller }) func setApproval(user : Principal, status : UserApproval.ApprovalStatus) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.setApproval(approvalState, user, status);
  };

  public query ({ caller }) func listApprovals() : async [UserApproval.UserApprovalInfo] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.listApprovals(approvalState);
  };

  public shared ({ caller }) func assignCallerUserRole(user : Principal, role : AccessControl.UserRole) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Access denied: Only admins can set roles");
    };

    // Set approval status to approved when assigning a role
    UserApproval.setApproval(approvalState, user, #approved);

    // Assign the role
    AccessControl.assignRole(accessControlState, caller, user, role);
  };

  public query ({ caller }) func getUserRole() : async AccessControl.UserRole {
    getEffectiveRole(caller);
  };

  public query ({ caller }) func isCallerAdmin() : async Bool {
    getEffectiveRole(caller) == #admin;
  };

  public shared ({ caller }) func setFrontendCanisterId(canisterId : Text) : async () {
    if (getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Only admins can set frontend canister ID");
    };
    frontendCanisterId := canisterId;
  };

  public shared ({ caller }) func setBackendCanisterId(canisterId : Text) : async () {
    if (getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Only admins can set backend canister ID");
    };
    backendCanisterId := canisterId;
  };

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    let trimmedName = profile.name.trim(#text " ");
    if (trimmedName == "") {
      Runtime.trap("Username cannot be empty");
    };

    for ((principal, existingProfile) in userProfiles.entries()) {
      if (principal != caller and existingProfile.name == profile.name) {
        Runtime.trap("Username already taken");
      };
    };

    userProfiles.add(caller, profile);
  };

  public query ({ caller }) func isUsernameUnique(username : Text) : async Bool {
    let trimmedName = username.trim(#text " ");
    if (trimmedName == "") { return false };

    for ((_, profile) in userProfiles.entries()) {
      if (profile.name == username) { return false };
    };
    true;
  };

  public query ({ caller }) func getStorageStats() : async StorageStats {
    if (getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Only admins can view storage statistics");
    };

    let totalSize = files.values().foldLeft(0, func(acc, file) { acc + file.size });

    {
      totalStorageBytes = totalSize;
      backendCanisterId;
      frontendCanisterId;
      appVersion;
    };
  };

  public query ({ caller }) func getMembers() : async [AdminInfo] {
    if (getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Only admins can view members");
    };

    let result = List.empty<AdminInfo>();
    let seenPrincipals = Map.empty<Principal, Bool>();

    // First, add the original admin if exists
    switch (firstAdmin) {
      case (?adminPrincipal) {
        let profile = userProfiles.get(adminPrincipal);
        let username = switch (profile) {
          case (?p) { p.name };
          case (null) { "Admin" };
        };
        result.add({
          principal = adminPrincipal;
          username;
          role = #admin;
        });
        seenPrincipals.add(adminPrincipal, true);
      };
      case (null) {};
    };

    // Get all approved users from the approval list
    let approvals = UserApproval.listApprovals(approvalState);
    for (approval in approvals.values()) {
      if (approval.status == #approved) {
        let userPrincipal = approval.principal;
        // Skip if already added (e.g., the first admin)
        switch (seenPrincipals.get(userPrincipal)) {
          case (?_) { /* already added */ };
          case (null) {
            let profile = userProfiles.get(userPrincipal);
            let username = switch (profile) {
              case (?p) { p.name };
              case (null) { "(No username)" };
            };
            let role = AccessControl.getUserRole(accessControlState, userPrincipal);
            result.add({
              principal = userPrincipal;
              username;
              role;
            });
            seenPrincipals.add(userPrincipal, true);
          };
        };
      };
    };

    let membersArray = result.toArray();
    let arraySize = membersArray.size();

    if (arraySize > 1) {
      var sortedArray = membersArray.toVarArray<AdminInfo>();

      var i = arraySize;
      while (i > 0) {
        var j = 0;
        while (j + 1 < i) {
          let a = sortedArray[j];
          let b = sortedArray[j + 1];
          if (shouldSwap(a, b)) {
            let temp = a;
            sortedArray[j] := sortedArray[j + 1];
            sortedArray[j + 1] := temp;
          };
          j += 1;
        };
        i -= 1;
      };

      sortedArray.toArray();
    } else {
      membersArray;
    };
  };

  func shouldSwap(a : AdminInfo, b : AdminInfo) : Bool {
    switch (a.role, b.role) {
      case (#admin, #user) { false };
      case (#user, #admin) { true };
      case (_, _) { false };
    };
  };

  public shared ({ caller }) func removeMember(principal : Principal) : async () {
    if (getEffectiveRole(caller) != #admin) {
      Runtime.trap("Unauthorized: Only admins can remove members");
    };

    // Prevent self-deletion
    if (caller == principal) {
      Runtime.trap("Cannot remove yourself");
    };

    // Protect the first/original admin from deletion
    switch (firstAdmin) {
      case (?first) {
        if (principal == first) {
          Runtime.trap("Cannot remove the original admin");
        };
      };
      case (null) {};
    };

    // Fully reset member-specific identity state
    userProfiles.remove(principal);
    UserApproval.setApproval(approvalState, principal, #pending);
    AccessControl.assignRole(accessControlState, caller, principal, #guest);
  };

  public shared ({ caller }) func addFile(id : Text, name : Text, size : Nat, parentId : ?Text, blob : Storage.ExternalBlob) : async () {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can add files");
    };

    let metadata : FileMetadata = {
      id;
      name;
      size;
      blob;
      parentId;
    };
    files.add(id, metadata);
  };

  public query ({ caller }) func getFiles() : async [FileMetadata] {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can view files");
    };
    files.values().toArray();
  };

  public query ({ caller }) func getFile(id : Text) : async ?FileMetadata {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can view files");
    };
    files.get(id);
  };

  public shared ({ caller }) func deleteFile(id : Text) : async Bool {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can delete files");
    };

    switch (files.get(id)) {
      case (null) { false };
      case (?_) {
        files.remove(id);
        true;
      };
    };
  };

  public query ({ caller }) func searchFiles(searchTerm : Text) : async [FileMetadata] {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can search files");
    };

    let lowercaseTerm = searchTerm.toLower();
    files.values().toArray().filter(
      func(file) {
        file.name.toLower().contains(#text lowercaseTerm);
      }
    );
  };

  // Folder Management
  public shared ({ caller }) func createFolder(name : Text, parentId : ?Text) : async Text {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can create folders");
    };

    let folderId = nextFolderId.toText();
    nextFolderId += 1;

    let folder : FolderMetadata = {
      id = folderId;
      name;
      parentId;
    };

    folders.add(folderId, folder);
    folderId;
  };

  public shared ({ caller }) func deleteFolder(id : Text) : async Bool {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can delete folders");
    };

    if (hasChildItems(id)) {
      Runtime.trap("Folder is not empty. Cannot delete");
    };

    switch (folders.get(id)) {
      case (null) { false };
      case (?_) {
        folders.remove(id);
        true;
      };
    };
  };

  func hasChildItems(folderId : Text) : Bool {
    for ((_, folder) in folders.entries()) {
      switch (folder.parentId) {
        case (?parent) { if (parent == folderId) { return true } };
        case (null) {};
      };
    };

    for ((_, file) in files.entries()) {
      switch (file.parentId) {
        case (?parent) { if (parent == folderId) { return true } };
        case (null) {};
      };
    };

    false;
  };

  public query ({ caller }) func getFolderContents(folderId : ?Text) : async [FileSystemItem] {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can view folder contents");
    };

    let items = List.empty<FileSystemItem>();

    for ((_, folder) in folders.entries()) {
      if (folder.parentId == folderId) {
        items.add(#folder(folder));
      };
    };

    for ((_, file) in files.entries()) {
      if (file.parentId == folderId) {
        items.add(#file(file));
      };
    };

    items.toArray();
  };

  public shared ({ caller }) func moveItem(itemId : Text, newParentId : ?Text, isFolder : Bool) : async () {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can move items");
    };

    if (isFolder) {
      switch (folders.get(itemId)) {
        case (null) { Runtime.trap("Folder not found") };
        case (?folder) {
          let updatedFolder : FolderMetadata = {
            folder with parentId = newParentId;
          };
          folders.add(itemId, updatedFolder);
        };
      };
    } else {
      switch (files.get(itemId)) {
        case (null) { Runtime.trap("File not found") };
        case (?file) {
          let updatedFile : FileMetadata = {
            file with parentId = newParentId;
          };
          files.add(itemId, updatedFile);
        };
      };
    };
  };

  public shared ({ caller }) func moveItems(moves : [FileMove]) : async () {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can move items");
    };

    for (move in moves.values()) {
      if (move.isFolder) {
        switch (folders.get(move.id)) {
          case (null) { Runtime.trap("Folder not found") };
          case (?folder) {
            let updatedFolder : FolderMetadata = {
              folder with parentId = move.newParentId;
            };
            folders.add(move.id, updatedFolder);
          };
        };
      } else {
        switch (files.get(move.id)) {
          case (null) { Runtime.trap("File not found") };
          case (?file) {
            let updatedFile : FileMetadata = {
              file with parentId = move.newParentId;
            };
            files.add(move.id, updatedFile);
          };
        };
      };
    };
  };

  public query ({ caller }) func getFolder(id : Text) : async ?FolderMetadata {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can view folders");
    };
    folders.get(id);
  };

  public query ({ caller }) func getAllFolders() : async [FolderMetadata] {
    if (getEffectiveRole(caller) == #guest) {
      Runtime.trap("Unauthorized: Only admins and approved users can view folders");
    };
    folders.values().toArray();
  };

  func getEffectiveRole(principal : Principal) : AccessControl.UserRole {
    let actualRole = AccessControl.getUserRole(accessControlState, principal);
    if (actualRole == #admin or UserApproval.isApproved(approvalState, principal)) {
      actualRole;
    } else {
      #guest;
    };
  };
};

