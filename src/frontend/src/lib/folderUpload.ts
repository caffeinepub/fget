import { ExternalBlob } from '../backend';
import { toast } from 'sonner';

export interface FolderUploadFile {
  file: File;
  relativePath: string;
}

export interface FolderUploadCallbacks {
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  addFile: (params: {
    id: string;
    name: string;
    size: bigint;
    blob: ExternalBlob;
    parentId: string | null;
  }) => Promise<void>;
  onProgress?: (current: number, total: number, fileName: string) => void;
}

/**
 * Validates that all files have relative paths (webkitRelativePath)
 */
export function validateFolderFiles(files: File[]): boolean {
  for (const file of files) {
    const webkitPath = (file as { webkitRelativePath?: string }).webkitRelativePath;
    if (!webkitPath) {
      return false;
    }
  }
  return true;
}

/**
 * Recursively uploads a folder structure with all nested files
 */
export async function uploadFolderRecursively(
  files: FolderUploadFile[],
  currentFolderId: string | null,
  callbacks: FolderUploadCallbacks
): Promise<void> {
  if (files.length === 0) {
    toast.info('No files found in the selected folder');
    return;
  }

  // Build a map of folder paths to their IDs
  const folderMap = new Map<string, string>();
  folderMap.set('', currentFolderId || ''); // Root is the current folder

  // Sort files by path depth to ensure parent folders are created first
  const sortedFiles = [...files].sort((a, b) => {
    const depthA = a.relativePath.split('/').length;
    const depthB = b.relativePath.split('/').length;
    return depthA - depthB;
  });

  // Process each file
  for (let i = 0; i < sortedFiles.length; i++) {
    const { file, relativePath } = sortedFiles[i];
    const pathParts = relativePath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    
    // Create all parent folders if needed
    let currentPath = '';
    let parentFolderId = currentFolderId;

    for (let j = 0; j < pathParts.length - 1; j++) {
      const folderName = pathParts[j];
      const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      if (!folderMap.has(folderPath)) {
        try {
          const newFolderId = await callbacks.createFolder(folderName, parentFolderId);
          folderMap.set(folderPath, newFolderId);
          parentFolderId = newFolderId;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
          toast.error(`Failed to create folder "${folderName}": ${errorMessage}`);
          throw error;
        }
      } else {
        parentFolderId = folderMap.get(folderPath) || null;
      }

      currentPath = folderPath;
    }

    // Upload the file
    try {
      if (callbacks.onProgress) {
        callbacks.onProgress(i + 1, sortedFiles.length, fileName);
      }

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        // Individual file upload progress can be tracked here if needed
      });

      await callbacks.addFile({
        id: `${Date.now()}-${i}-${Math.random()}`,
        name: fileName,
        size: BigInt(file.size),
        blob,
        parentId: parentFolderId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(`Failed to upload ${fileName}: ${errorMessage}`);
      throw error;
    }
  }
}

/**
 * Extracts files with relative paths from a FileList
 */
export function extractFolderFiles(fileList: FileList): FolderUploadFile[] {
  const files: FolderUploadFile[] = [];
  
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const webkitPath = (file as { webkitRelativePath?: string }).webkitRelativePath;
    
    if (webkitPath) {
      files.push({
        file,
        relativePath: webkitPath,
      });
    }
  }
  
  return files;
}
