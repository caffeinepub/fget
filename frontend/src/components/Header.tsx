import { Upload, LogOut, LogIn, Loader2, Copy, Check, Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { useGetCallerUserProfile, useGetCallerUserRole } from '../hooks/useQueries';
import { useState } from 'react';
import { toast } from 'sonner';
import { ManagePanel } from './ManagePanel';
import { UserRole } from '../backend';

export function Header() {
  const { login, clear, loginStatus, identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { data: userProfile } = useGetCallerUserProfile();
  const { data: userRole } = useGetCallerUserRole();
  const [copiedPrincipal, setCopiedPrincipal] = useState(false);

  const isAuthenticated = !!identity;
  const isLoggingIn = loginStatus === 'logging-in';
  const isAdmin = userRole === UserRole.admin;

  const handleAuth = async () => {
    if (isAuthenticated) {
      await clear();
      queryClient.clear();
    } else {
      try {
        await login();
      } catch (error: any) {
        console.error('Login error:', error);
        if (error.message === 'User is already authenticated') {
          await clear();
          setTimeout(() => login(), 300);
        }
      }
    }
  };

  const getShortenedPrincipal = () => {
    if (!identity) return '';
    const principal = identity.getPrincipal().toString();
    if (principal.length <= 11) return principal;
    return `${principal.slice(0, 4)}...${principal.slice(-4)}`;
  };

  const handleCopyPrincipal = async () => {
    if (!identity) return;
    const principal = identity.getPrincipal().toString();
    try {
      await navigator.clipboard.writeText(principal);
      setCopiedPrincipal(true);
      toast.success('Principal ID copied to clipboard');
      setTimeout(() => setCopiedPrincipal(false), 2000);
    } catch (error) {
      toast.error('Failed to copy Principal ID');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Upload className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">fget</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isAuthenticated && userProfile && (
            <>
              <div className="hidden md:flex items-center gap-2">
                <Badge variant="secondary" className="text-sm font-medium">
                  {userProfile.name}
                </Badge>
                <Button
                  onClick={handleCopyPrincipal}
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
                >
                  {getShortenedPrincipal()}
                  {copiedPrincipal ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              {isAdmin && <ManagePanel />}
            </>
          )}
          <ThemeToggle />
          <Button
            onClick={handleAuth}
            disabled={isLoggingIn}
            variant={isAuthenticated ? 'outline' : 'default'}
            size="sm"
            className="gap-2"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : isAuthenticated ? (
              <>
                <LogOut className="h-4 w-4" />
                Logout
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Login
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
