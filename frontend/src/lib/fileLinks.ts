import { toast } from 'sonner';
import type { FileMetadata } from '../backend';

/**
 * Generates a fully-qualified direct download URL from a file blob
 */
export function getFileDirectURL(file: FileMetadata): string {
  return file.blob.getDirectURL();
}

/**
 * Copies a file's direct URL to the clipboard
 */
export async function copyFileLink(file: FileMetadata): Promise<void> {
  const url = getFileDirectURL(file);
  
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      
      try {
        document.execCommand('copy');
        toast.success('Link copied to clipboard');
      } catch (err) {
        toast.error('Failed to copy link');
      }
      
      document.body.removeChild(textArea);
    }
  } catch (error) {
    toast.error('Failed to copy link');
  }
}

/**
 * Downloads a file with the correct filename using blob approach for reliable naming
 */
export async function downloadFile(file: FileMetadata): Promise<void> {
  try {
    // Fetch the file bytes and create a local blob URL for reliable filename control
    const bytes = await file.blob.getBytes();
    const blob = new Blob([bytes]);
    const blobUrl = URL.createObjectURL(blob);
    
    // Create a temporary anchor element with the correct filename
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = file.name; // Set the download filename to the original name
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    toast.success(`Downloading ${file.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    toast.error(`Failed to download file: ${errorMessage}`);
    console.error('Download error:', error);
  }
}
