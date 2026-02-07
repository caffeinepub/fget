import { Download, File, FileText, Image, Video, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useGetFolderContents, useDeleteFile, useDeleteFolder, useCreateFolder, useMoveItem, useGetAllFolders, useAddFile } from '../hooks/useQueries';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useState, useMemo, useCallback, useRef } from 'react';
import type { FileSystemItem, FolderMetadata, FileMetadata } from '../backend';
import { ExternalBlob } from '../backend';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { FilePreviewModal } from './FilePreviewModal';
import { getFileExtension, getMimeType, isPreviewable, isImage } from '../lib/fileTypes';

export function FileList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Root' }]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  const { data: items, isLoading, error } = useGetFolderContents(currentFolderId);
  const { data: allFolders } = useGetAllFolders();
  const createFolder = useCreateFolder();
  const addFile = useAddFile();

  // Filter items locally for instant feedback
  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!searchTerm.trim()) return items;
    
    const lowerSearch = searchTerm.toLowerCase();
    return items.filter(item => {
      if (item.__kind__ === 'file') {
        return item.file.name.toLowerCase().includes(lowerSearch);
      } else {
        return item.folder.name.toLowerCase().includes(lowerSearch);
      }
    });
  }, [items, searchTerm]);

  // Get all image files from current folder for gallery navigation
  const imageFiles = useMemo(() => {
    if (!filteredItems) return [];
    return filteredItems
      .filter((item): item is { __kind__: 'file'; file: FileMetadata } => 
        item.__kind__ === 'file' && isImage(getFileExtension(item.file.name))
      )
      .map(item => item.file);
  }, [filteredItems]);

  const handleNavigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    setSearchTerm('');
  };

  const handleNavigateToPath = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
    setSearchTerm('');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Folder name cannot be empty');
      return;
    }

    try {
      await createFolder.mutateAsync({ name: newFolderName, parentId: currentFolderId });
      toast.success('Folder created', {
        description: `${newFolderName} has been created`
      });
      setShowCreateFolder(false);
      setNewFolderName('');
    } catch (error) {
      console.error('Create folder error:', error);
      toast.error('Failed to create folder', {
        description: 'Please try again'
      });
    }
  };

  // File upload handlers
  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;

      const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
      setUploadingFiles(prev => [...prev, fileId]);
      setUploadProgress(0);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        const blob = ExternalBlob.fromBytes(bytes).withUploadProgress((percentage) => {
          setUploadProgress(percentage);
        });

        await addFile.mutateAsync({
          id: fileId,
          name: file.name,
          size: BigInt(file.size),
          blob: blob,
          parentId: currentFolderId,
        });
        
        toast.success('File uploaded successfully', {
          description: `${file.name} (${formatFileSize(file.size)})`
        });
        setUploadProgress(0);
      } catch (error) {
        toast.error('Error uploading file', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
        setUploadProgress(0);
      } finally {
        setUploadingFiles(prev => prev.filter(id => id !== fileId));
      }
    },
    [addFile, currentFolderId]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      
      if (fileArray.length === 0) return;

      toast.info(`Uploading ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}...`);

      // Upload files sequentially to avoid overwhelming the system
      for (const file of fileArray) {
        await handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const items = Array.from(e.dataTransfer.items);
      const files: File[] = [];

      // Process all items (files and folders)
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            await processEntry(entry, files);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }

      if (files.length > 0) {
        await handleFiles(files);
      }
    },
    [handleFiles]
  );

  // Recursive function to process directory entries
  const processEntry = async (entry: any, files: File[]): Promise<void> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          files.push(file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      return new Promise((resolve) => {
        reader.readEntries(async (entries: any[]) => {
          for (const childEntry of entries) {
            await processEntry(childEntry, files);
          }
          resolve();
        });
      });
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleFileClick = (file: FileMetadata) => {
    const extension = getFileExtension(file.name);
    
    if (isPreviewable(extension)) {
      // Find the index if it's an image
      if (isImage(extension)) {
        const index = imageFiles.findIndex(img => img.id === file.id);
        setCurrentImageIndex(index >= 0 ? index : 0);
      }
      setPreviewFile(file);
      setShowPreview(true);
    } else {
      // Start download for unsupported types
      handleDownloadFile(file);
    }
  };

  const handleDownloadFile = async (file: FileMetadata) => {
    try {
      toast.info('Preparing download...', {
        description: `Getting ${file.name} ready`
      });

      const bytes = await file.blob.getBytes();
      const extension = getFileExtension(file.name);
      const mimeType = getMimeType(extension);
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      toast.success('Download started', {
        description: `Downloading ${file.name}`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed', {
        description: 'Please try again'
      });
    }
  };

  const handleNavigateImage = (index: number) => {
    if (index >= 0 && index < imageFiles.length) {
      setCurrentImageIndex(index);
      setPreviewFile(imageFiles[index]);
    }
  };

  const isUploading = uploadingFiles.length > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Drive</CardTitle>
          <CardDescription>Loading file list...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-9 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Drive</CardTitle>
          <CardDescription className="text-destructive">
            Error loading files
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fileCount = items?.filter(item => item.__kind__ === 'file').length || 0;
  const folderCount = items?.filter(item => item.__kind__ === 'folder').length || 0;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInput}
        disabled={isUploading}
        multiple
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderInput}
        disabled={isUploading}
        {...({ webkitdirectory: '', directory: '' } as any)}
        multiple
      />

      <Card
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`transition-all duration-200 ${
          isDragging ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''
        }`}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>My Drive</CardTitle>
              <CardDescription>
                {folderCount > 0 && `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`}
                {folderCount > 0 && fileCount > 0 && ' • '}
                {fileCount > 0 && `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
                {folderCount === 0 && fileCount === 0 && 'No items'}
                {searchTerm && filteredItems.length !== items?.length && (
                  <> • Showing {filteredItems.length} matching {filteredItems.length === 1 ? 'item' : 'items'}</>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                className="gap-2"
                disabled={isUploading}
              >
                <Upload className="h-4 w-4" />
                Upload Files
              </Button>
              <Button
                onClick={() => folderInputRef.current?.click()}
                size="sm"
                variant="secondary"
                className="gap-2"
                disabled={isUploading}
              >
                <FolderUp className="h-4 w-4" />
                Upload Folder
              </Button>
              <Button
                onClick={() => setShowCreateFolder(true)}
                size="sm"
                variant="outline"
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Upload Progress */}
            {isUploading && uploadProgress > 0 && (
              <div className="space-y-2 p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Uploading {uploadingFiles.length} file{uploadingFiles.length > 1 ? 's' : ''}...
                  </span>
                  <span className="font-medium">{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Drag and Drop Overlay */}
            {isDragging && (
              <div className="p-8 rounded-lg border-2 border-dashed border-primary bg-primary/5 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
                <p className="text-lg font-medium text-primary">Drop files or folders here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Files will be uploaded to {currentFolderId ? 'the current folder' : 'the root directory'}
                </p>
              </div>
            )}

            {/* Breadcrumb Navigation */}
            {folderPath.length > 1 && (
              <Breadcrumb>
                <BreadcrumbList>
                  {folderPath.map((path, index) => (
                    <div key={path.id || 'root'} className="flex items-center">
                      {index > 0 && <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>}
                      <BreadcrumbItem>
                        {index === folderPath.length - 1 ? (
                          <BreadcrumbPage>{path.name}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            onClick={() => handleNavigateToPath(index)}
                            className="cursor-pointer"
                          >
                            {path.name}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </div>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search files and folders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Items List */}
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  {searchTerm ? (
                    <Search className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <File className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? `No items found matching "${searchTerm}"` : 'No items in this folder'}
                </p>
                {!searchTerm && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Drag and drop files here or use the upload buttons above
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  item.__kind__ === 'folder' ? (
                    <FolderItem
                      key={item.folder.id}
                      folder={item.folder}
                      onNavigate={handleNavigateToFolder}
                      allFolders={allFolders || []}
                      currentFolderId={currentFolderId}
                    />
                  ) : (
                    <FileItem
                      key={item.file.id}
                      file={item.file}
                      allFolders={allFolders || []}
                      currentFolderId={currentFolderId}
                      onFileClick={handleFileClick}
                    />
                  )
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFolder();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              disabled={createFolder.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={createFolder.isPending || !newFolderName.trim()}
            >
              {createFolder.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewFile(null);
        }}
        allImages={imageFiles}
        currentImageIndex={currentImageIndex}
        onNavigate={handleNavigateImage}
      />
    </>
  );
}

function FolderItem({ 
  folder, 
  onNavigate,
  allFolders,
  currentFolderId
}: { 
  folder: FolderMetadata; 
  onNavigate: (id: string, name: string) => void;
  allFolders: FolderMetadata[];
  currentFolderId: string | null;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<string>('root');
  const deleteFolder = useDeleteFolder();
  const moveItem = useMoveItem();

  const handleDelete = async () => {
    try {
      await deleteFolder.mutateAsync(folder.id);
      toast.success('Folder deleted', {
        description: `${folder.name} has been removed`
      });
      setShowDeleteDialog(false);
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage = error?.message || 'Unknown error';
      toast.error('Failed to delete folder', {
        description: errorMessage.includes('not empty') ? 'Folder must be empty before deletion' : 'Please try again'
      });
    }
  };

  const handleMove = async () => {
    try {
      const newParentId = selectedDestination === 'root' ? null : selectedDestination;
      await moveItem.mutateAsync({ itemId: folder.id, newParentId, isFolder: true });
      toast.success('Folder moved', {
        description: `${folder.name} has been moved`
      });
      setShowMoveDialog(false);
    } catch (error) {
      console.error('Move error:', error);
      toast.error('Failed to move folder', {
        description: 'Please try again'
      });
    }
  };

  // Filter out current folder and its descendants from move destinations
  const availableFolders = allFolders.filter(f => f.id !== folder.id && f.parentId !== folder.id);

  return (
    <>
      <div className="group flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Folder className="h-5 w-5" />
        </div>
        
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onNavigate(folder.id, folder.name)}
        >
          <p className="font-medium truncate hover:text-primary transition-colors">{folder.name}</p>
          <p className="text-sm text-muted-foreground">Folder</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowMoveDialog(true)}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <MoveRight className="h-4 w-4" />
            Move
          </Button>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            size="sm"
            variant="destructive"
            disabled={deleteFolder.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{folder.name}</strong>? The folder must be empty. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFolder.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteFolder.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFolder.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Folder</DialogTitle>
            <DialogDescription>
              Select a destination for <strong>{folder.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedDestination} onValueChange={setSelectedDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Root</SelectItem>
              {availableFolders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMoveDialog(false)}
              disabled={moveItem.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={moveItem.isPending}
            >
              {moveItem.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Moving...
                </>
              ) : (
                'Move'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FileItem({ 
  file,
  allFolders,
  currentFolderId,
  onFileClick,
}: { 
  file: FileMetadata;
  allFolders: FolderMetadata[];
  currentFolderId: string | null;
  onFileClick: (file: FileMetadata) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<string>('root');
  const deleteFile = useDeleteFile();
  const moveItem = useMoveItem();
  const fileSize = formatFileSize(Number(file.size));
  const fileExtension = getFileExtension(file.name);
  const FileIcon = getFileIcon(fileExtension);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const bytesPromise = file.blob.getBytes();
      
      toast.info('Preparing download...', {
        description: `Getting ${file.name} ready`
      });

      const bytes = await bytesPromise;
      const mimeType = getMimeType(fileExtension);
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      toast.success('Download started', {
        description: `Downloading ${file.name}`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed', {
        description: 'Please try again'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    const url = file.blob.getDirectURL();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard', {
        description: 'Share this link to allow anyone to download the file'
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link', {
        description: 'Please try again'
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFile.mutateAsync(file.id);
      toast.success('File deleted', {
        description: `${file.name} has been removed`
      });
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file', {
        description: 'Please try again'
      });
    }
  };

  const handleMove = async () => {
    try {
      const newParentId = selectedDestination === 'root' ? null : selectedDestination;
      await moveItem.mutateAsync({ itemId: file.id, newParentId, isFolder: false });
      toast.success('File moved', {
        description: `${file.name} has been moved`
      });
      setShowMoveDialog(false);
    } catch (error) {
      console.error('Move error:', error);
      toast.error('Failed to move file', {
        description: 'Please try again'
      });
    }
  };

  return (
    <>
      <div className="group flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileIcon className="h-5 w-5" />
        </div>
        
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onFileClick(file)}
        >
          <p className="font-medium truncate hover:text-primary transition-colors">{file.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">{fileSize}</p>
            {fileExtension && (
              <>
                <span className="text-muted-foreground">•</span>
                <Badge variant="secondary" className="text-xs uppercase">
                  {fileExtension}
                </Badge>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Download
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download
              </>
            )}
          </Button>
          <Button
            onClick={handleCopyLink}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copy link
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Copy link
              </>
            )}
          </Button>
          <Button
            onClick={() => setShowMoveDialog(true)}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <MoveRight className="h-4 w-4" />
            Move
          </Button>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            size="sm"
            variant="destructive"
            disabled={deleteFile.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{file.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFile.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteFile.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFile.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move File</DialogTitle>
            <DialogDescription>
              Select a destination for <strong>{file.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedDestination} onValueChange={setSelectedDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Root</SelectItem>
              {allFolders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMoveDialog(false)}
              disabled={moveItem.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={moveItem.isPending}
            >
              {moveItem.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Moving...
                </>
              ) : (
                'Move'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(extension: string) {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
  const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];

  if (imageExts.includes(extension)) return Image;
  if (videoExts.includes(extension)) return Video;
  if (audioExts.includes(extension)) return Music;
  if (archiveExts.includes(extension)) return Archive;
  if (docExts.includes(extension)) return FileText;
  
  return File;
}
