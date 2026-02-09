import { Download, File, FileText, Image, Video, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp, X, FileCode } from 'lucide-react';
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
import { FilePreviewModal } from './FilePreviewModal';
import { getFileExtension, getMimeType, isPreviewable, isImage, getFileTypeLabel, getFileCategory, type FileCategory } from '../lib/fileTypes';
import { copyFileLink } from '../lib/fileLinks';
import { uploadFolderRecursively, extractFolderFiles, validateFolderFiles } from '../lib/folderUpload';
import { extractDroppedFiles } from '../lib/dragDropDirectory';
import { resolvePathSegment, buildBreadcrumbPath, resolveFileParentPath, getContainingFolderPath, getFolderContainingPath } from '../lib/folderNavigation';
import { sortFileSystemItems, type SortField, type SortDirection } from '../lib/sortFileSystemItems';
import { formatCompactTimestamp } from '../lib/formatTime';
import { FileListHeaderRow } from './FileListHeaderRow';
import { generateSecure32ByteId } from '../lib/id';

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
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
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

  const deleteFile = useDeleteFile();
  const deleteFolder = useDeleteFolder();
  const moveItem = useMoveItem();

  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [itemToMove, setItemToMove] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);

  const rawDisplayItems = isSearchActive ? searchResults : items;

  // Apply sorting to display items
  const displayItems = useMemo(() => {
    if (!rawDisplayItems) return undefined;
    return sortFileSystemItems(rawDisplayItems, sortField, sortDirection);
  }, [rawDisplayItems, sortField, sortDirection]);

  // Get ALL files in current context for navigation (not just previewable), sorted
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

  // Navigate to containing folder from search result path click
  const handleSearchResultPathClick = (item: FileSystemItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!allFolders) {
      toast.error('Folder list not loaded');
      return;
    }

    try {
      let targetFolderId: string | null;
      
      if (item.__kind__ === 'folder') {
        // For folders, navigate to the parent folder
        targetFolderId = item.folder.parentId || null;
      } else {
        // For files, navigate to the containing folder (parent)
        targetFolderId = item.file.parentId || null;
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
          id: generateSecure32ByteId(),
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
        createFolder: async (name, parentId) => {
          const result = await createFolder.mutateAsync({ name, parentId });
          return result;
        },
        addFile: async (params) => {
          await addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          setUploadProgress((current / total) * 100);
        },
      });

      toast.success('Folder uploaded successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Folder upload failed';
      toast.error(errorMessage);
    } finally {
      setUploadingFiles([]);
      setUploadProgress(0);
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
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
        toast.error('No files found');
        return;
      }

      // Check if any files have paths (indicating folder structure)
      const hasStructure = droppedFiles.some(f => f.relativePath.includes('/'));

      if (hasStructure) {
        // Upload with folder structure
        setUploadingFiles(droppedFiles.map(f => f.file.name));

        await uploadFolderRecursively(droppedFiles, currentFolderId, {
          createFolder: async (name, parentId) => {
            const result = await createFolder.mutateAsync({ name, parentId });
            return result;
          },
          addFile: async (params) => {
            await addFile.mutateAsync(params);
          },
          onProgress: (current, total, fileName) => {
            setUploadProgress((current / total) * 100);
          },
        });

        toast.success('Files uploaded successfully');
      } else {
        // Upload as individual files
        setUploadingFiles(droppedFiles.map(f => f.file.name));

        for (let i = 0; i < droppedFiles.length; i++) {
          const { file } = droppedFiles[i];
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setUploadProgress(percentage);
          });

          await addFile.mutateAsync({
            id: generateSecure32ByteId(),
            name: file.name,
            size: BigInt(file.size),
            blob,
            parentId: currentFolderId,
          });
        }

        toast.success('Files uploaded successfully');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMessage);
    } finally {
      setUploadingFiles([]);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes: bigint): string => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return '0 B';
    
    const kb = numBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getFileIcon = (fileName: string) => {
    const ext = getFileExtension(fileName).toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) {
      return <Video className="h-5 w-5 text-purple-500" />;
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
      return <Music className="h-5 w-5 text-green-500" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Archive className="h-5 w-5 text-orange-500" />;
    }
    if (['txt', 'md', 'log'].includes(ext)) {
      return <FileText className="h-5 w-5 text-gray-500" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'sh', 'bash', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext)) {
      return <FileCode className="h-5 w-5 text-cyan-500" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const getCategoryIcon = (category: FileCategory) => {
    switch (category) {
      case 'image':
        return <Image className="h-5 w-5 text-blue-500" />;
      case 'video':
        return <Video className="h-5 w-5 text-purple-500" />;
      case 'audio':
        return <Music className="h-5 w-5 text-green-500" />;
      case 'archive':
        return <Archive className="h-5 w-5 text-orange-500" />;
      case 'code':
        return <FileCode className="h-5 w-5 text-cyan-500" />;
      case 'document':
        return <FileText className="h-5 w-5 text-blue-400" />;
      case 'text':
        return <FileText className="h-5 w-5 text-gray-500" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDownload = async (file: FileMetadata) => {
    try {
      const bytes = await file.blob.getBytes();
      const blob = new Blob([bytes], { type: getMimeType(file.name) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      toast.error(errorMessage);
    }
  };

  if (error) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            <p>Error loading files: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* Breadcrumb Navigation - Styled as clickable pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {folderPath.map((segment, index) => (
          <div key={segment.id || 'root'} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <button
              onClick={() => handleBreadcrumbClick(index)}
              className="px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors text-sm font-medium"
            >
              {segment.name}
            </button>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search files and folders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => setShowCreateFolder(true)}
                variant="outline"
                size="sm"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </Button>
              <Button
                onClick={() => folderInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                <FolderUp className="h-4 w-4 mr-2" />
                Upload Folder
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent
          className={`min-h-[400px] ${isDragging ? 'bg-muted/50 border-2 border-dashed border-primary' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploadingFiles.length > 0 && (
            <div className="mb-4 p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Uploading {uploadingFiles.length} file(s)...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <div className="text-xs text-muted-foreground max-h-20 overflow-y-auto">
                {uploadingFiles.map((name, i) => (
                  <div key={i}>{name}</div>
                ))}
              </div>
            </div>
          )}

          {isLoading || searchLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : displayItems && displayItems.length > 0 ? (
            <div className="space-y-1">
              <FileListHeaderRow
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              {displayItems.map((item) => {
                if (item.__kind__ === 'folder') {
                  const folder = item.folder;
                  return (
                    <div
                      key={folder.id}
                      className="grid grid-cols-[1fr_80px_180px_120px_200px] gap-4 items-center p-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer group"
                      onClick={() => !isSearchActive && handleFolderClick(folder)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{folder.name}</div>
                          {isSearchActive && allFolders && (
                            <button
                              onClick={(e) => handleSearchResultPathClick(item, e)}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-full"
                            >
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              {getFolderContainingPath(folder, allFolders)}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">Folder</div>
                      <div className="text-sm text-muted-foreground">{formatCompactTimestamp(folder.createdAt)}</div>
                      <div className="text-sm text-muted-foreground">—</div>
                      <div className="flex items-center justify-end gap-2">
                        {!isSearchActive && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToMove({ id: folder.id, name: folder.name, isFolder: true });
                              }}
                            >
                              <MoveRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete({ id: folder.id, name: folder.name, isFolder: true });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {isSearchActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFolderClick(folder);
                            }}
                          >
                            Open
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  const file = item.file;
                  const category = getFileCategory(file.name);
                  return (
                    <div
                      key={file.id}
                      className="grid grid-cols-[1fr_80px_180px_120px_200px] gap-4 items-center p-3 hover:bg-muted/50 rounded-lg transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getCategoryIcon(category)}
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => handleFileClick(file)}
                            className="font-medium truncate hover:text-primary transition-colors text-left block max-w-full"
                          >
                            {file.name}
                          </button>
                          {isSearchActive && allFolders && (
                            <button
                              onClick={(e) => handleSearchResultPathClick(item, e)}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-full"
                            >
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              {getContainingFolderPath(file, allFolders)}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">{getFileTypeLabel(file.name)}</div>
                      <div className="text-sm text-muted-foreground">{formatCompactTimestamp(file.createdAt)}</div>
                      <div className="text-sm text-muted-foreground">{formatFileSize(file.size)}</div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyFileLink(file)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {!isSearchActive && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setItemToMove({ id: file.id, name: file.name, isFolder: false })}
                            >
                              <MoveRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setItemToDelete({ id: file.id, name: file.name, isFolder: false })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {isSearchActive ? (
                <div>
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No results found for "{searchTerm}"</p>
                </div>
              ) : (
                <div>
                  <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>This folder is empty</p>
                  <p className="text-sm mt-2">Upload files or create a new folder to get started</p>
                </div>
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
        // @ts-ignore - webkitdirectory is not in the types but is supported
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
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
          <Select
            value={moveDestination || 'root'}
            onValueChange={(value) => setMoveDestination(value === 'root' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Drive (Root)</SelectItem>
              {allFolders?.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
      {showPreview && previewFile && (
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
      )}
    </div>
  );
}
