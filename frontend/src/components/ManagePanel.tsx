import { useState } from 'react';
import { Settings, UserPlus, Copy, Check, Loader2, Database, Shield, Server, Info, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetMembers, useAddMember, useRemoveMember, useGetStorageStats } from '../hooks/useQueries';
import { toast } from 'sonner';
import { Principal } from '@icp-sdk/core/principal';
import { UserRole } from '../backend';
import { Badge } from '@/components/ui/badge';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { useQueryClient } from '@tanstack/react-query';
import { APP_VERSION } from '../lib/appVersion';

export function ManagePanel() {
  const [open, setOpen] = useState(false);
  const [principalId, setPrincipalId] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.user);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<{ principal: Principal; username: string } | null>(null);
  
  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = useGetMembers();
  const { data: storageStats, isLoading: statsLoading } = useGetStorageStats();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const { identity, clear } = useInternetIdentity();
  const queryClient = useQueryClient();

  // First admin is the first member in the list (backend ensures this)
  const firstAdminPrincipal = members && members.length > 0 ? members[0].principal.toString() : null;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedId = principalId.trim();
    
    if (!trimmedId) {
      toast.error('Please enter a Principal ID');
      return;
    }

    try {
      const principal = Principal.fromText(trimmedId);
      await addMember.mutateAsync({ principal, role: selectedRole });
      
      // Force immediate refetch to ensure UI updates
      await refetchMembers();
      
      toast.success('Member added successfully');
      setPrincipalId('');
      setSelectedRole(UserRole.user);
    } catch (error) {
      toast.error('Failed to add member', {
        description: error instanceof Error ? error.message : 'Invalid Principal ID'
      });
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;

    const deletedPrincipalStr = memberToDelete.principal.toString();
    const currentUserPrincipal = identity?.getPrincipal().toString();

    try {
      await removeMember.mutateAsync(memberToDelete.principal);
      
      // Force immediate refetch to ensure UI updates
      await refetchMembers();
      
      toast.success('Member removed successfully', {
        description: `${memberToDelete.username} has been removed`
      });
      setMemberToDelete(null);

      // If the deleted member is the current user, log them out
      if (currentUserPrincipal === deletedPrincipalStr) {
        // Clear all cached data
        queryClient.clear();
        // Log out the user
        await clear();
        toast.info('You have been removed from the system', {
          description: 'Please log in again to set up a new profile'
        });
      }
    } catch (error) {
      toast.error('Failed to remove member', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const getShortenedPrincipal = (principal: string) => {
    if (principal.length <= 11) return principal;
    return `${principal.slice(0, 4)}...${principal.slice(-4)}`;
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const formatStorageSize = (bytes: bigint): string => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return '0 B';
    
    const kb = numBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === UserRole.admin) {
      return (
        <Badge variant="default" className="gap-1">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      );
    } else if (role === UserRole.user) {
      return (
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" />
          User
        </Badge>
      );
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Manage</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Settings className="h-6 w-6 text-primary" />
              Manage
            </DialogTitle>
            <DialogDescription>
              View storage statistics and manage members
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Storage Statistics */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-blue-500" />
                  Storage Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : storageStats ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/60">
                    <span className="text-sm text-muted-foreground">Used:</span>
                    <span className="text-lg font-semibold text-blue-500">
                      {formatStorageSize(storageStats.totalStorageBytes)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Unable to load statistics
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Current Members */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Current Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members && members.length > 0 ? (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const principalStr = member.principal.toString();
                      const isCopied = copiedId === principalStr;
                      const isFirstAdmin = principalStr === firstAdminPrincipal;
                      
                      return (
                        <div
                          key={principalStr}
                          className="flex items-center justify-between p-3 rounded-lg bg-background/60"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                              {member.role === UserRole.admin ? (
                                <Shield className="h-4 w-4 text-primary" />
                              ) : (
                                <User className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{member.username}</p>
                                {getRoleBadge(member.role)}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {getShortenedPrincipal(principalStr)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              onClick={() => handleCopyText(principalStr, 'Principal ID')}
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span className="text-xs">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span className="text-xs">Copy</span>
                                </>
                              )}
                            </Button>
                            {!isFirstAdmin && (
                              <Button
                                onClick={() => setMemberToDelete({ principal: member.principal, username: member.username })}
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">Delete</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No members found
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Add New Member */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Server className="h-5 w-5 text-green-500" />
                  Add New Member
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddMember} className="space-y-3">
                  <div className="flex gap-px">
                    <div className="w-32 flex-shrink-0">
                      <Select
                        value={selectedRole}
                        onValueChange={(value) => setSelectedRole(value as UserRole)}
                        disabled={addMember.isPending}
                      >
                        <SelectTrigger className="rounded-r-none">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UserRole.admin}>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Admin
                            </div>
                          </SelectItem>
                          <SelectItem value={UserRole.user}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              User
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Input
                        id="principalId"
                        type="text"
                        placeholder="Enter principal ID (e.g., rdmx6-jaaaa-aaaah-qcaiq-cai)"
                        value={principalId}
                        onChange={(e) => setPrincipalId(e.target.value)}
                        disabled={addMember.isPending}
                        className="font-mono text-sm rounded-l-none"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={addMember.isPending || !principalId.trim()}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {addMember.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Add
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Separator />

            {/* App Version */}
            <Card className="bg-card/50 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">App Version:</span>
                  <span className="text-lg font-semibold text-primary">
                    {APP_VERSION}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation Dialog */}
      <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToDelete?.username}</strong>? This will remove their profile, roles, and approval status. They will be logged out and treated as a new user on next login. Their uploaded files and folders will remain available to all members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
