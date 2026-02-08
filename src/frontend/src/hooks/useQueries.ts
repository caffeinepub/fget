import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import { ExternalBlob } from '../backend';
import type { UserProfile, FileMetadata, AdminInfo, StorageStats, FileSystemItem, FolderMetadata, FileMove, UserRole } from '../backend';
import { Principal } from '@icp-sdk/core/principal';
import { containsNormalized } from '../lib/searchNormalize';
import { buildSubtreeFolderIds } from '../lib/subtreeIndex';

export function useGetCallerUserRole() {
  const { actor, isFetching: actorFetching } = useActor();

  return useQuery<UserRole>({
    queryKey: ['callerUserRole'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getUserRole();
    },
    enabled: !!actor && !actorFetching,
  });
}

export function useIsCallerApproved() {
  const { actor, isFetching: actorFetching } = useActor();

  return useQuery<boolean>({
    queryKey: ['callerApproved'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.isCallerApproved();
    },
    enabled: !!actor && !actorFetching,
  });
}

// Derived access: user must be admin OR (user role AND approved)
export function useEffectiveAccess() {
  const { data: userRole, isLoading: roleLoading } = useGetCallerUserRole();
  const { data: isApproved, isLoading: approvalLoading } = useIsCallerApproved();

  const isLoading = roleLoading || approvalLoading;
  const hasAccess = userRole === 'admin' || (userRole === 'user' && isApproved === true);

  return { hasAccess, isLoading };
}

export function useGetCallerUserProfile() {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  const query = useQuery<UserProfile | null>({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });

  return {
    ...query,
    isLoading: actorFetching || accessLoading || query.isLoading,
    isFetched: !!actor && !accessLoading && hasAccess && query.isFetched,
  };
}

export function useSaveCallerUserProfile() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      if (!actor) throw new Error('Actor not available');
      return actor.saveCallerUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
    },
  });
}

export function useIsUsernameUnique() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async (username: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.isUsernameUnique(username);
    },
  });
}

export function useRequestApproval() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.requestApproval();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callerApproved'] });
    },
  });
}

export function useGetFiles() {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileMetadata[]>({
    queryKey: ['files'],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getFiles();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useSearchFiles(searchTerm: string) {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileMetadata[]>({
    queryKey: ['files', 'search', searchTerm],
    queryFn: async () => {
      if (!actor) return [];
      if (!searchTerm.trim()) {
        return actor.getFiles();
      }
      return actor.searchFiles(searchTerm);
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

/**
 * Client-side recursive subtree search with Unicode-aware, case-insensitive, diacritics-insensitive matching.
 * Searches folder and file names only (not content) within the current folder subtree.
 * Now includes files in descendant subfolders.
 */
export function useSearchSubtree(searchTerm: string, startFolderId: string | null) {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  const trimmedTerm = searchTerm.trim();

  return useQuery<FileSystemItem[]>({
    queryKey: ['subtreeSearch', startFolderId, trimmedTerm],
    queryFn: async () => {
      if (!actor || !trimmedTerm) return [];

      // Fetch all folders and files
      const [allFolders, allFiles] = await Promise.all([
        actor.getAllFolders(),
        actor.getFiles(),
      ]);

      // Build a set of folder IDs that are in the current subtree
      const subtreeFolderIds = buildSubtreeFolderIds(allFolders, startFolderId);

      // Filter folders: must be in subtree and match search term
      const matchingFolders = allFolders.filter(folder => {
        // Check if folder is in the correct subtree
        let isInSubtree: boolean;
        if (startFolderId === null) {
          // If searching from root, include all folders
          isInSubtree = true;
        } else {
          // Folder must be the start folder itself, or in its subtree, or a direct child
          isInSubtree = folder.id === startFolderId || subtreeFolderIds.has(folder.id) || folder.parentId === startFolderId;
        }
        
        if (!isInSubtree) return false;

        // Check if name matches search term (Unicode-aware, case-insensitive, diacritics-insensitive)
        return containsNormalized(folder.name, trimmedTerm);
      });

      // Filter files: must be in current folder OR any descendant folder, and match search term
      const matchingFiles = allFiles.filter(file => {
        // Check if file is in the correct subtree
        let isInSubtree: boolean;
        if (startFolderId === null) {
          // When searching from root, include files from ALL folders (not just root-level files)
          // A file is in the subtree if it has no parent (root-level) OR its parent is any folder
          isInSubtree = file.parentId === null || file.parentId === undefined || subtreeFolderIds.has(file.parentId);
        } else {
          // File must be in the current folder OR in any descendant folder
          isInSubtree = file.parentId === startFolderId || (!!file.parentId && subtreeFolderIds.has(file.parentId));
        }
        
        if (!isInSubtree) return false;

        // Check if name matches search term (Unicode-aware, case-insensitive, diacritics-insensitive)
        return containsNormalized(file.name, trimmedTerm);
      });

      // Combine results
      const results: FileSystemItem[] = [
        ...matchingFolders.map(folder => ({ __kind__: 'folder' as const, folder })),
        ...matchingFiles.map(file => ({ __kind__: 'file' as const, file })),
      ];

      return results;
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess && !!trimmedTerm,
    retry: false,
  });
}

export function useAddFile() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      size,
      blob,
      parentId,
    }: {
      id: string;
      name: string;
      size: bigint;
      blob: ExternalBlob;
      parentId: string | null;
    }) => {
      if (!actor) throw new Error('Actor not available');
      return actor.addFile(id, name, size, parentId, blob);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      queryClient.invalidateQueries({ queryKey: ['subtreeSearch'] });
      queryClient.invalidateQueries({ queryKey: ['storageStats'] });
    },
  });
}

export function useDeleteFile() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.deleteFile(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      queryClient.invalidateQueries({ queryKey: ['subtreeSearch'] });
      queryClient.invalidateQueries({ queryKey: ['storageStats'] });
    },
  });
}

export function useGetMembers() {
  const { actor, isFetching: actorFetching } = useActor();
  const { data: userRole } = useGetCallerUserRole();

  // Only enable if user is admin
  const isAdmin = userRole === 'admin';

  return useQuery<AdminInfo[]>({
    queryKey: ['members'],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getMembers();
    },
    enabled: !!actor && !actorFetching && isAdmin,
    retry: false,
  });
}

export function useAddMember() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ principal, role }: { principal: Principal; role: UserRole }) => {
      if (!actor) throw new Error('Actor not available');
      return actor.assignCallerUserRole(principal, role);
    },
    onSuccess: async () => {
      // Invalidate and actively refetch members list
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.refetchQueries({ queryKey: ['members'] });
      
      // Also invalidate approval-related queries in case the added user is currently logged in
      queryClient.invalidateQueries({ queryKey: ['callerApproved'] });
      queryClient.invalidateQueries({ queryKey: ['callerUserRole'] });
    },
  });
}

export function useRemoveMember() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (principal: Principal) => {
      if (!actor) throw new Error('Actor not available');
      return actor.removeMember(principal);
    },
    onSuccess: async () => {
      // Invalidate and actively refetch members list
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.refetchQueries({ queryKey: ['members'] });
    },
  });
}

export function useGetStorageStats() {
  const { actor, isFetching: actorFetching } = useActor();
  const { data: userRole } = useGetCallerUserRole();

  // Only enable if user is admin
  const isAdmin = userRole === 'admin';

  return useQuery<StorageStats>({
    queryKey: ['storageStats'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getStorageStats();
    },
    enabled: !!actor && !actorFetching && isAdmin,
    retry: false,
  });
}

export function useSetFrontendCanisterId() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async (canisterId: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.setFrontendCanisterId(canisterId);
    },
  });
}

// Folder Management Hooks

export function useCreateFolder() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: string | null }) => {
      if (!actor) throw new Error('Actor not available');
      return actor.createFolder(name, parentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['subtreeSearch'] });
    },
  });
}

export function useDeleteFolder() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.deleteFolder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['subtreeSearch'] });
    },
  });
}

export function useGetFolderContents(folderId: string | null) {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileSystemItem[]>({
    queryKey: ['folderContents', folderId],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getFolderContents(folderId);
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useGetAllFolders() {
  const { actor, isFetching: actorFetching } = useActor();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FolderMetadata[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllFolders();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useMoveItem() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, newParentId, isFolder }: { itemId: string; newParentId: string | null; isFolder: boolean }) => {
      if (!actor) throw new Error('Actor not available');
      return actor.moveItem(itemId, newParentId, isFolder);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['subtreeSearch'] });
    },
  });
}
