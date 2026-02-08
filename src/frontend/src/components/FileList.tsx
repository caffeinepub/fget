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
import { getFileExtension, getMimeType, isPreviewable, isImage, getFileTypeLabel } from '../lib/fileTypes';
import { copyFileLink } from '../lib/fileLinks';
import { uploadFolderRecursively, extractFolderFiles, validateFolderFiles } from '../lib/folderUpload';
import { extractDroppedFiles } from '../lib/dragDropDirectory';
import { resolvePathSegment, buildBreadcrumbPath, resolveFileParentPath } from '../lib/folderNavigation';

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

  // Get ALL files in current context for navigation (not just previewable)
  const allFilesInContext = useMemo(() => {
    if (!displayItems) return [];
    return displayItems
      .filter((item): item is { __kind__: 'file'; file: FileMetadata } => 
        item.__kind__ === 'file'
      )
      .map(item => item.file);
  }, [displayItems]);

  const handleFileClick = useCallback((file: FileMetadata) => {
    const fileIndex = allFilesInContext.findIndex(f => f.id === file.id);
    if (fileIndex !== -1) {
      setCurrentFileIndex(fileIndex);
      setPreviewFile(file);
      setShowPreview(true);
    }
  }, [allFilesInContext]);

  const handleNavigateFile = useCallback((index: number) => {
    if (allFilesInContext.length === 0 || index < 0 || index >= allFilesInContext.length) return;
    
    setCurrentFileIndex(index);
    setPreviewFile(allFilesInContext[index]);
  }, [allFilesInContext]);

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

  const handlePathSegmentClick = (item: FileSystemItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!allFolders) {
      toast.error('Folder list not loaded');
      return;
    }

    try {
      let targetFolderId: string | null;
      
      if (item.__kind__ === 'folder') {
        // Navigate to the folder itself
        targetFolderId = item.folder.id;
      } else {
        // Navigate to the file's parent folder
        targetFolderId = resolveFileParentPath(item.file, allFolders);
      }
      
      const newPath = buildBreadcrumbPath(targetFolderId, allFolders);
      
      setCurrentFolderId(targetFolderId);
      setFolderPath(newPath);
      setSearchTerm('');
      
      const targetName = targetFolderId === null ? 'Drive' : allFolders.find(f => f.id === targetFolderId)?.name || 'folder';
      toast.success(`Navigated to ${targetName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to navigate';
      toast.error(errorMessage);
    }
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
    
    // Validate that all files have relative paths
    if (!validateFolderFiles(fileArray)) {
      toast.error('Browser does not support folder upload with structure. Please try drag-and-drop instead.');
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      return;
    }

    const folderFiles = extractFolderFiles(files);
    
    if (folderFiles.length === 0) {
      toast.error('No files found in the selected folder');
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      return;
    }

    try {
      setUploadingFiles(folderFiles.map(f => f.file.name));

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: (name, parentId) => createFolder.mutateAsync({ name, parentId }),
        addFile: (params) => addFile.mutateAsync(params),
        onProgress: (current, total, fileName) => {
          setUploadProgress(Math.round((current / total) * 100));
        },
      });

      toast.success(`Folder uploaded successfully with ${folderFiles.length} file(s)`);
      setUploadingFiles([]);
      setUploadProgress(0);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload folder';
      toast.error(errorMessage);
      setUploadingFiles([]);
      setUploadProgress(0);
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

    try {
      const droppedFiles = await extractDroppedFiles(e.dataTransfer);
      
      if (droppedFiles.length === 0) {
        toast.error('No files found in the dropped items');
        return;
      }

      // Check if any files have paths (indicating folder structure)
      const hasStructure = droppedFiles.some(f => f.relativePath.includes('/'));

      if (hasStructure) {
        // Upload with folder structure
        setUploadingFiles(droppedFiles.map(f => f.file.name));

        await uploadFolderRecursively(droppedFiles, currentFolderId, {
          createFolder: (name, parentId) => createFolder.mutateAsync({ name, parentId }),
          addFile: (params) => addFile.mutateAsync(params),
          onProgress: (current, total, fileName) => {
            setUploadProgress(Math.round((current / total) * 100));
          },
        });

        toast.success(`Uploaded ${droppedFiles.length} file(s) with folder structure`);
        setUploadingFiles([]);
        setUploadProgress(0);
      } else {
        // Upload as individual files
        const fileList = new DataTransfer();
        droppedFiles.forEach(df => fileList.items.add(df.file));
        await handleFileUpload(fileList.files);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process dropped items';
      toast.error(errorMessage);
      setUploadingFiles([]);
      setUploadProgress(0);
    }
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

  const handleFileDownload = async (file: FileMetadata) => {
    try {
      const bytes = await file.blob.getBytes();
      const mimeType = getMimeType(getFileExtension(file.name));
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
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
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

            {/* Breadcrumb Navigation */}
            {!isSearchActive && (
              <div className="flex items-center gap-2 text-sm overflow-x-auto pb-1">
                {folderPath.map((segment, index) => (
                  <div key={segment.id || 'root'} className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleBreadcrumbClick(index)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {segment.name}
                    </button>
                    {index < folderPath.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Search Results Header */}
            {isSearchActive && (
              <div className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Search results for "{searchTerm}"
                  {searchResults && ` (${searchResults.length} ${searchResults.length === 1 ? 'item' : 'items'})`}
                </span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent
          className="p-0 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-10 flex items-center justify-center">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
                <p className="text-lg font-medium">Drop files or folders here</p>
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {uploadingFiles.length > 0 && (
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Uploading {uploadingFiles.length} {uploadingFiles.length === 1 ? 'file' : 'files'}...
                </span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <div className="mt-2 text-xs text-muted-foreground">
                {uploadingFiles.slice(0, 3).join(', ')}
                {uploadingFiles.length > 3 && ` and ${uploadingFiles.length - 3} more`}
              </div>
            </div>
          )}

          {/* File List */}
          <div className="divide-y">
            {isLoading || searchLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayItems && displayItems.length > 0 ? (
              displayItems.map((item) => {
                if (item.__kind__ === 'folder') {
                  const folder = item.folder;
                  const folderFullPath = folderPathMap.get(folder.id) || folder.name;
                  
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors group"
                    >
                      <Folder className="h-10 w-10 text-violet-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => handleFolderClick(folder)}
                          className="text-left w-full"
                        >
                          <p className="font-medium truncate hover:text-primary transition-colors">
                            {folder.name}
                          </p>
                          {isSearchActive && (
                            <button
                              onClick={(e) => handlePathSegmentClick(item, e)}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block"
                            >
                              {folderFullPath}
                            </button>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => setItemToMove({ id: folder.id, name: folder.name, isFolder: true })}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
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
                                onClick={() => setItemToDelete({ id: folder.id, name: folder.name, isFolder: true })}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete folder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                } else {
                  const file = item.file;
                  const ext = getFileExtension(file.name);
                  const fileType = getFileTypeLabel(file.name);
                  const fileSize = formatFileSize(file.size);
                  const canPreview = isPreviewable(ext);
                  
                  // Build file path for search results
                  let fileFullPath = '';
                  if (isSearchActive && file.parentId) {
                    fileFullPath = folderPathMap.get(file.parentId) || '';
                  }
                  
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex-shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => canPreview && handleFileClick(file)}
                          className="text-left w-full"
                          disabled={!canPreview}
                        >
                          <p className={`font-medium truncate ${canPreview ? 'hover:text-primary cursor-pointer' : 'cursor-default'} transition-colors`}>
                            {file.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {fileType} • {fileSize}
                          </p>
                          {isSearchActive && fileFullPath && (
                            <button
                              onClick={(e) => handlePathSegmentClick(item, e)}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block"
                            >
                              {fileFullPath}
                            </button>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => handleFileDownload(file)}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
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
                                onClick={() => copyFileLink(file)}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
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
                                onClick={() => setItemToMove({ id: file.id, name: file.name, isFolder: false })}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
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
                                onClick={() => setItemToDelete({ id: file.id, name: file.name, isFolder: false })}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete file</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                }
              })
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium mb-1">
                  {isSearchActive ? 'No results found' : 'This folder is empty'}
                </p>
                <p className="text-sm">
                  {isSearchActive 
                    ? 'Try a different search term' 
                    : 'Upload files or create a new folder to get started'}
                </p>
              </div>
            )}
          </div>
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
        multiple
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
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
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
              {itemToDelete?.isFolder && ' The folder must be empty to be deleted.'}
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
      <FilePreviewModal
        file={previewFile}
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewFile(null);
        }}
        allFiles={allFilesInContext}
        currentFileIndex={currentFileIndex}
        onNavigateFile={handleNavigateFile}
      />
    </>
  );
}
