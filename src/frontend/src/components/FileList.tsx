import { Download, File, FileText, Image, Video, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useGetFolderContents, useDeleteFile, useDeleteFolder, useCreateFolder, useMoveItem, useGetAllFolders, useAddFile, useSearchSubtree } from '../hooks/useQueries';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FilePreviewModal } from './FilePreviewModal';
import { getFileExtension, getMimeType, isPreviewable, isImage } from '../lib/fileTypes';
import { copyFileLink } from '../lib/fileLinks';

export function FileList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Drive' }]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { data: items, isLoading, error } = useGetFolderContents(currentFolderId);
  const { data: searchResults, isLoading: searchLoading } = useSearchSubtree(searchTerm, currentFolderId);
  const { data: allFolders } = useGetAllFolders();
  const createFolder = useCreateFolder();
  const addFile = useAddFile();

  // Determine if we're in search mode
  const isSearchActive = searchTerm.trim().length > 0;

  // Build a map of folder ID to full path for search results
  const folderPathMap = useMemo(() => {
    if (!allFolders) return new Map<string, string>();
    
    const map = new Map<string, string>();
    
    // Helper to build path for a folder
    const buildPath = (folderId: string): string => {
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder) return '';
      
      if (!folder.parentId) {
        return folder.name;
      }
      
      const parentPath = buildPath(folder.parentId);
      return parentPath ? `${parentPath}/${folder.name}` : folder.name;
    };
    
    allFolders.forEach(folder => {
      map.set(folder.id, buildPath(folder.id));
    });
    
    return map;
  }, [allFolders]);

  const deleteFile = useDeleteFile();
  const deleteFolder = useDeleteFolder();
  const moveItem = useMoveItem();

  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [itemToMove, setItemToMove] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);

  const displayItems = isSearchActive ? searchResults : items;

  // Get all previewable files for navigation
  const previewableFiles = useMemo(() => {
    if (!displayItems) return [];
    return displayItems
      .filter((item): item is { __kind__: 'file'; file: FileMetadata } => 
        item.__kind__ === 'file' && isPreviewable(item.file.name)
      )
      .map(item => item.file);
  }, [displayItems]);

  const handleFileClick = useCallback((file: FileMetadata) => {
    const fileIndex = previewableFiles.findIndex(f => f.id === file.id);
    if (fileIndex !== -1) {
      setCurrentFileIndex(fileIndex);
      setPreviewFile(file);
      setShowPreview(true);
    }
  }, [previewableFiles]);

  const handleNavigateFile = useCallback((index: number) => {
    if (previewableFiles.length === 0 || index < 0 || index >= previewableFiles.length) return;
    
    setCurrentFileIndex(index);
    setPreviewFile(previewableFiles[index]);
  }, [previewableFiles]);

  const handleFolderClick = (folder: FolderMetadata) => {
    setCurrentFolderId(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    setSearchTerm('');
  };

  const handleBreadcrumbClick = (index: number) => {
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
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parentId: currentFolderId,
      });
      toast.success('Folder created successfully');
      setShowCreateFolder(false);
      setNewFolderName('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
      toast.error(errorMessage);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.isFolder) {
        await deleteFolder.mutateAsync(itemToDelete.id);
        toast.success('Folder deleted successfully');
      } else {
        await deleteFile.mutateAsync(itemToDelete.id);
        toast.success('File deleted successfully');
      }
      setItemToDelete(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete item';
      toast.error(errorMessage);
    }
  };

  const handleMoveConfirm = async () => {
    if (!itemToMove) return;

    try {
      await moveItem.mutateAsync({
        itemId: itemToMove.id,
        newParentId: moveDestination,
        isFolder: itemToMove.isFolder,
      });
      toast.success('Item moved successfully');
      setItemToMove(null);
      setMoveDestination(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to move item';
      toast.error(errorMessage);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploadingFiles(fileArray.map(f => f.name));

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
          setUploadProgress(percentage);
        });

        await addFile.mutateAsync({
          id: `${Date.now()}-${i}`,
          name: file.name,
          size: BigInt(file.size),
          blob,
          parentId: currentFolderId,
        });

        toast.success(`${file.name} uploaded successfully`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }
    }

    setUploadingFiles([]);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Extract folder name from the first file's path
    const firstFile = fileArray[0];
    const webkitPath = (firstFile as { webkitRelativePath?: string }).webkitRelativePath;
    
    if (!webkitPath) {
      toast.error('Could not determine folder structure');
      return;
    }

    const folderName = webkitPath.split('/')[0];
    
    try {
      // Create the folder
      const newFolderId = await createFolder.mutateAsync({
        name: folderName,
        parentId: currentFolderId,
      });

      // Upload only immediate child files (ignore nested subdirectories)
      const immediateFiles = fileArray.filter(file => {
        const path = (file as { webkitRelativePath?: string }).webkitRelativePath || '';
        const parts = path.split('/');
        // Only include files that are direct children (folderName/filename)
        return parts.length === 2 && parts[0] === folderName;
      });

      if (immediateFiles.length === 0) {
        toast.success(`Folder "${folderName}" created (no immediate child files found)`);
        return;
      }

      setUploadingFiles(immediateFiles.map(f => f.name));

      for (let i = 0; i < immediateFiles.length; i++) {
        const file = immediateFiles[i];
        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setUploadProgress(percentage);
          });

          await addFile.mutateAsync({
            id: `${Date.now()}-${i}`,
            name: file.name,
            size: BigInt(file.size),
            blob,
            parentId: newFolderId,
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
        }
      }

      toast.success(`Folder "${folderName}" created with ${immediateFiles.length} file(s)`);
      setUploadingFiles([]);
      setUploadProgress(0);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
      toast.error(errorMessage);
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    await handleFileUpload(files);
  };

  const getFileIcon = (fileName: string) => {
    const ext = getFileExtension(fileName);
    
    if (isImage(fileName)) return <Image className="h-5 w-5 text-violet-500" />;
    
    switch (ext) {
      case 'mp4':
      case 'webm':
      case 'mov':
      case 'avi':
        return <Video className="h-5 w-5 text-violet-500" />;
      case 'mp3':
      case 'wav':
      case 'ogg':
        return <Music className="h-5 w-5 text-violet-500" />;
      case 'pdf':
      case 'doc':
      case 'docx':
        return <FileText className="h-5 w-5 text-violet-500" />;
      case 'zip':
      case 'rar':
      case '7z':
        return <Archive className="h-5 w-5 text-violet-500" />;
      default:
        return <File className="h-5 w-5 text-violet-500" />;
    }
  };

  const formatFileSize = (bytes: bigint) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Number(bytes);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const availableFolders = useMemo(() => {
    if (!allFolders || !itemToMove) return [];
    
    // Filter out the item being moved (if it's a folder) and its descendants
    if (itemToMove.isFolder) {
      const excludedIds = new Set<string>([itemToMove.id]);
      
      // Find all descendants
      const findDescendants = (parentId: string) => {
        allFolders.forEach(folder => {
          if (folder.parentId === parentId && !excludedIds.has(folder.id)) {
            excludedIds.add(folder.id);
            findDescendants(folder.id);
          }
        });
      };
      
      findDescendants(itemToMove.id);
      
      return allFolders.filter(folder => !excludedIds.has(folder.id));
    }
    
    return allFolders;
  }, [allFolders, itemToMove]);

  const handleClearSearch = () => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Error loading files: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="border-b border-border/50 bg-muted/30">
          <div className="flex flex-col gap-4">
            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search files and folders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-9 bg-background"
                />
                {searchTerm && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreateFolder(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <FolderPlus className="h-4 w-4" />
                  New Folder
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
                <Button
                  onClick={() => folderInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <FolderUp className="h-4 w-4" />
                  Upload Folder
                </Button>
              </div>
            </div>

            {/* Search Results Info */}
            {isSearchActive && (
              <div className="text-sm text-muted-foreground">
                {searchLoading ? (
                  <span>Searching...</span>
                ) : (
                  <span>
                    Found {displayItems?.length || 0} result(s) for "{searchTerm}"
                  </span>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent
          className={`p-6 min-h-[400px] ${isDragging ? 'bg-primary/5 border-2 border-dashed border-primary' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Breadcrumb Navigation - moved here */}
          <div className="flex items-center gap-2 text-sm mb-4 pb-3 border-b border-border/50">
            {folderPath.map((folder, index) => (
              <div key={folder.id || 'root'} className="flex items-center gap-2">
                {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className="text-foreground hover:text-primary transition-colors font-medium"
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>

          {uploadingFiles.length > 0 && (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Uploading {uploadingFiles.length} file(s)...</span>
                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <div className="mt-2 text-xs text-muted-foreground">
                {uploadingFiles.map((name, i) => (
                  <div key={i}>{name}</div>
                ))}
              </div>
            </div>
          )}

          {isLoading || searchLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : displayItems && displayItems.length > 0 ? (
            <div className="space-y-2">
              {displayItems.map((item) => {
                if (item.__kind__ === 'folder') {
                  const folder = item.folder;
                  const folderFullPath = folderPathMap.get(folder.id);
                  
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <Folder className="h-5 w-5 text-violet-500 flex-shrink-0" />
                      <button
                        onClick={() => handleFolderClick(folder)}
                        className="flex-1 text-left font-medium hover:text-primary transition-colors"
                      >
                        {folder.name}
                      </button>
                      {isSearchActive && folderFullPath && (
                        <span className="text-xs text-muted-foreground mr-2">
                          {folderFullPath}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        Folder
                      </Badge>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToMove({ id: folder.id, name: folder.name, isFolder: true });
                                  setMoveDestination(null);
                                }}
                              >
                                <MoveRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move folder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToDelete({ id: folder.id, name: folder.name, isFolder: true });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete folder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                }

                const file = item.file;
                const fileParentPath = file.parentId ? folderPathMap.get(file.parentId) : null;
                const canPreview = isPreviewable(file.name);

                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (canPreview) {
                        handleFileClick(file);
                      }
                    }}
                  >
                    {getFileIcon(file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    {isSearchActive && fileParentPath && (
                      <span className="text-xs text-muted-foreground mr-2">
                        {fileParentPath}
                      </span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyFileLink(file);
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy link</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = file.blob.getDirectURL();
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = file.name;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToMove({ id: file.id, name: file.name, isFolder: false });
                                setMoveDestination(null);
                              }}
                            >
                              <MoveRight className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Move file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete({ id: file.id, name: file.name, isFolder: false });
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              {isSearchActive ? (
                <>
                  <Search className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No results found</p>
                  <p className="text-sm">Try a different search term</p>
                </>
              ) : (
                <>
                  <Folder className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">This folder is empty</p>
                  <p className="text-sm">Upload files or create a new folder to get started</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore - webkitdirectory is not in the types
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFolderUpload}
      />

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
            <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>
              {createFolder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {itemToDelete?.isFolder ? 'the folder' : 'the file'} "{itemToDelete?.name}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFile.isPending || deleteFolder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Item Dialog */}
      <Dialog open={!!itemToMove} onOpenChange={() => setItemToMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {itemToMove?.isFolder ? 'Folder' : 'File'}</DialogTitle>
            <DialogDescription>
              Select a destination folder for "{itemToMove?.name}"
            </DialogDescription>
          </DialogHeader>
          <Select value={moveDestination || 'root'} onValueChange={(value) => setMoveDestination(value === 'root' ? null : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Drive (Root)</SelectItem>
              {availableFolders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folderPathMap.get(folder.id) || folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemToMove(null)}>
              Cancel
            </Button>
            <Button onClick={handleMoveConfirm} disabled={moveItem.isPending}>
              {moveItem.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Moving...
                </>
              ) : (
                'Move'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPreviewFile(null);
          }}
          allFiles={previewableFiles}
          currentFileIndex={currentFileIndex}
          onNavigateFile={handleNavigateFile}
        />
      )}
    </>
  );
}
