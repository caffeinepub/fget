import { useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FileList } from './components/FileList';
import { ProfileSetup } from './components/ProfileSetup';
import { AccessDenied } from './components/AccessDenied';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from 'next-themes';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useGetCallerUserProfile, useEffectiveAccess, useSetFrontendCanisterId } from './hooks/useQueries';
import { Loader2 } from 'lucide-react';
import { getFrontendCanisterId } from './lib/canisterIds';
import { useQueryClient } from '@tanstack/react-query';

export default function App() {
  const { identity, isInitializing } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();
  
  // Only fetch profile if user has access
  const { data: userProfile, isLoading: profileLoading, isFetched } = useGetCallerUserProfile();
  const setFrontendCanisterId = useSetFrontendCanisterId();

  const isAuthenticated = !!identity;
  
  // Show pending approval screen for authenticated users without access (regardless of profile status)
  const showPendingApproval = isAuthenticated && !accessLoading && !hasAccess;
  
  // Show profile setup only if user has access but no profile
  const showProfileSetup = isAuthenticated && hasAccess && !profileLoading && isFetched && userProfile === null;
  
  // Only show content if user is authenticated, has access, and has a profile
  const showContent = isAuthenticated && hasAccess && userProfile !== null && !accessLoading;

  // Set frontend canister ID when user with access is authenticated
  useEffect(() => {
    if (hasAccess && !setFrontendCanisterId.isPending) {
      const frontendId = getFrontendCanisterId();
      
      // Only set if we have a valid ID (not 'unknown')
      if (frontendId && frontendId !== 'unknown') {
        setFrontendCanisterId.mutate(frontendId);
      }
    }
  }, [hasAccess]);

  // Clear all queries when user loses access or is unapproved
  useEffect(() => {
    if (isAuthenticated && !accessLoading && !hasAccess) {
      // User is authenticated but doesn't have access (unapproved or removed)
      // Clear all file-related queries to prevent stale data and "Error loading files"
      queryClient.removeQueries({ queryKey: ['files'] });
      queryClient.removeQueries({ queryKey: ['folderContents'] });
      queryClient.removeQueries({ queryKey: ['folders'] });
      queryClient.removeQueries({ queryKey: ['storageStats'] });
      queryClient.removeQueries({ queryKey: ['members'] });
      queryClient.removeQueries({ queryKey: ['currentUserProfile'] });
    }
  }, [isAuthenticated, accessLoading, hasAccess, queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          {isInitializing || (isAuthenticated && accessLoading) ? (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          ) : !isAuthenticated ? (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center text-center space-y-4 min-h-[60vh]">
                <h2 className="text-4xl font-bold tracking-tight sm:text-5xl bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Personal File Storage & Sharing
                </h2>
              </div>
            </div>
          ) : showPendingApproval ? (
            <AccessDenied />
          ) : showProfileSetup ? (
            <ProfileSetup />
          ) : showContent ? (
            <div className="container mx-auto px-4 py-8 max-w-5xl">
              <FileList />
            </div>
          ) : (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}
        </main>
        <Footer />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
