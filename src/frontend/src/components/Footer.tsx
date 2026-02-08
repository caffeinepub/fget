import { Heart } from 'lucide-react';
import { APP_VERSION } from '../lib/appVersion';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-6 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <p>
            © 2026. Built with <Heart className="inline h-4 w-4 text-red-500 fill-red-500" /> using{' '}
            <a
              href="https://caffeine.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              caffeine.ai
            </a>
          </p>
          <p className="text-xs">
            Version {APP_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
}
