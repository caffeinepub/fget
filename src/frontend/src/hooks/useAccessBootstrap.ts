import { useEffect, useRef } from 'react';
import { useActor } from './useActor';
import { useInternetIdentity } from './useInternetIdentity';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Bootstrap hook that automatically calls initializeAccessControl() once per authenticated session
 * and invalidates access-related React Query caches after bootstrap completes.
 */
export function useAccessBootstrap() {
  const { actor, isFetching: actorFetching } = useActor();
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const bootstrapAttemptedRef = useRef<string | null>(null);
  const isBootstrappingRef = useRef(false);

  useEffect(() => {
    if (!actor || actorFetching || !identity || isBootstrappingRef.current) {
      return;
    }

    const principalString = identity.getPrincipal().toString();

    // Check if we've already attempted bootstrap for this principal in this session
    const sessionKey = `fget_bootstrap_${principalString}`;
    const hasBootstrapped = sessionStorage.getItem(sessionKey);

    // Also check our ref to prevent double-calls in the same render cycle
    if (hasBootstrapped || bootstrapAttemptedRef.current === principalString) {
      return;
    }

    // Mark as bootstrapping to prevent concurrent calls
    isBootstrappingRef.current = true;
    bootstrapAttemptedRef.current = principalString;

    // Call initializeAccessControl and then invalidate access-related queries
    (async () => {
      try {
        await actor.initializeAccessControl();
        
        // Mark this principal as bootstrapped in sessionStorage
        sessionStorage.setItem(sessionKey, 'true');

        // Invalidate and refetch all access-related queries so the UI updates immediately
        await queryClient.invalidateQueries({ queryKey: ['callerUserRole'] });
        await queryClient.invalidateQueries({ queryKey: ['callerApproved'] });
        await queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
        await queryClient.invalidateQueries({ queryKey: ['members'] });
        
        // Refetch to ensure the UI gets the new state
        await queryClient.refetchQueries({ queryKey: ['callerUserRole'] });
        await queryClient.refetchQueries({ queryKey: ['callerApproved'] });
      } catch (error) {
        // Silently handle errors - initializeAccessControl may fail if already initialized
        console.debug('Bootstrap attempt completed:', error);
      } finally {
        isBootstrappingRef.current = false;
      }
    })();
  }, [actor, actorFetching, identity, queryClient]);
}
