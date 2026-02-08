import { toast } from 'sonner';
import type { FileMetadata } from '../backend';

/**
 * Get a fully-qualified direct URL for a file that can be used with curl/wget
 */
export function getFullDirectURL(file: FileMetadata): string {
  const directURL = file.blob.getDirectURL();
  
  // If the URL is already absolute, return it as-is
  if (directURL.startsWith('http://') || directURL.startsWith('https://')) {
    return directURL;
  }
  
  // Otherwise, construct a fully-qualified URL using the current origin
  const url = new URL(directURL, window.location.origin);
  return url.toString();
}

/**
 * Copy a file's direct download URL to the clipboard
 */
export async function copyFileLink(file: FileMetadata): Promise<void> {
  try {
    const fullURL = getFullDirectURL(file);
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(fullURL);
      toast.success('Link copied', {
        description: 'Direct download link copied to clipboard'
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullURL;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        toast.success('Link copied', {
          description: 'Direct download link copied to clipboard'
        });
      } catch (err) {
        toast.error('Copy failed', {
          description: 'Please try again'
        });
      } finally {
        document.body.removeChild(textArea);
      }
    }
  } catch (error) {
    console.error('Copy link error:', error);
    toast.error('Copy failed', {
      description: 'Please try again'
    });
  }
}
