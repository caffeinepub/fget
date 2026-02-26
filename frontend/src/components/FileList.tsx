import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Download, File, FileText, Image as ImageIcon, Video as VideoIcon, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp, X, FileCode, FileQuestion, LayoutList, LayoutGrid, FileImage, FileVideo, FileAudio, FileArchive, FileType } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useGetFolderContents, useDeleteFile, useDeleteFolder, useCreateFolder, useMoveItem, useMoveItems, useGetAllFolders, useAddFile, useSearchSubtree } from '../hooks/useQueries';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { FileSystemItem, FolderMetadata, FileMetadata, FileMove } from '../backend';
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
import { FileGallery } from './FileGallery';
import { getFileExtension, getMimeType, isPreviewable, isImage, getFileTypeLabel, getFileCategory, type FileCategory } from '../lib/fileTypes';
import { copyFileLink, downloadFile } from '../lib/fileLinks';
import { uploadFolderRecursively, extractFolderFiles, validateFolderFiles } from '../lib/folderUpload';
import { extractDroppedFiles } from '../lib/dragDropDirectory';
import { resolvePathSegment, buildBreadcrumbPath, resolveFileParentPath, getContainingFolderPath, getFolderContainingPath, getFolderPathString } from '../lib/folderNavigation';
import { sortFileSystemItems, type SortField, type SortDirection } from '../lib/sortFileSystemItems';
import { formatCompactTimestamp } from '../lib/formatTime';
import { formatFileSize } from '../lib/formatFileSize';
import { FileListHeaderRow } from './FileListHeaderRow';
import { generateSecure32ByteId } from '../lib/id';
import { usePerFolderViewMode, type ViewMode } from '../hooks/usePerFolderViewMode';
import { getFileTypeTintClasses, getFolderTintClasses, getUnknownTypeTintClasses } from '../lib/fileTypeTints';

interface FileListProps {
  currentFolderId: string | null;
  onFolderNavigate: (folderId: string | null) => void;
}

interface FileUploadProgress {
  fileName: string;
  percentage: number;
  status: 'uploading' | 'complete' | 'error';
}

export function FileList({ currentFolderId, onFolderNavigate }: FileListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Drive' }]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<Map<string, FileUploadProgress>>(new Map());
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Per-folder view mode
  const { getViewMode, setViewMode } = usePerFolderViewMode();
  const currentViewMode = getViewMode(currentFolderId);
  
  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
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
  const moveItems = useMoveItems();

  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [itemToMove, setItemToMove] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);
  
  // Bulk action states
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkMoveDestination, setBulkMoveDestination] = useState<string | null>(null);

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
    onFolderNavigate(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    setSearchTerm('');
    setSelectedItems(new Set());
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    onFolderNavigate(newPath[newPath.length - 1].id);
    setSearchTerm('');
    setSelectedItems(new Set());
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
      
      onFolderNavigate(targetFolderId);
      setFolderPath(newPath);
      setSearchTerm('');
      setSelectedItems(new Set());
      
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

  // Multi-select handlers
  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelection = new Set(selectedItems);
    if (checked) {
      newSelection.add(itemId);
    } else {
      newSelection.delete(itemId);
    }
    setSelectedItems(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!displayItems) return;
    
    if (checked) {
      const allIds = new Set(displayItems.map(item => 
        item.__kind__ === 'file' ? item.file.id : item.folder.id
      ));
      setSelectedItems(allIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedItems.size === 0) return;

    try {
      const itemsToDelete = displayItems?.filter(item => {
        const id = item.__kind__ === 'file' ? item.file.id : item.folder.id;
        return selectedItems.has(id);
      }) || [];

      for (const item of itemsToDelete) {
        if (item.__kind__ === 'folder') {
          await deleteFolder.mutateAsync(item.folder.id);
        } else {
          await deleteFile.mutateAsync(item.file.id);
        }
      }

      toast.success(`${selectedItems.size} item(s) deleted successfully`);
      setSelectedItems(new Set());
      setShowBulkDelete(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete items';
      toast.error(errorMessage);
    }
  };

  const handleBulkMoveConfirm = async () => {
    if (selectedItems.size === 0) return;

    try {
      const itemsToMove = displayItems?.filter(item => {
        const id = item.__kind__ === 'file' ? item.file.id : item.folder.id;
        return selectedItems.has(id);
      }) || [];

      const moves: FileMove[] = itemsToMove.map(item => ({
        id: item.__kind__ === 'file' ? item.file.id : item.folder.id,
        isFolder: item.__kind__ === 'folder',
        newParentId: bulkMoveDestination || undefined,
      }));

      await moveItems.mutateAsync(moves);

      toast.success(`${selectedItems.size} item(s) moved successfully`);
      setSelectedItems(new Set());
      setShowBulkMove(false);
      setBulkMoveDestination(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to move items';
      toast.error(errorMessage);
    }
  };

  const allSelected = Boolean(displayItems && displayItems.length > 0 && selectedItems.size === displayItems.length);
  const someSelected = selectedItems.size > 0 && !allSelected;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Filter out empty files
    const nonEmptyFiles: File[] = [];
    const emptyFiles: string[] = [];
    
    for (const file of fileArray) {
      if (file.size === 0) {
        emptyFiles.push(file.name);
      } else {
        nonEmptyFiles.push(file);
      }
    }

    // Show info for skipped empty files
    if (emptyFiles.length > 0) {
      if (emptyFiles.length === 1) {
        toast.info(`Skipped empty file: ${emptyFiles[0]}`);
      } else {
        toast.info(`Skipped ${emptyFiles.length} empty files`);
      }
    }

    // If all files were empty, return early
    if (nonEmptyFiles.length === 0) {
      toast.info('No non-empty files to upload');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Initialize progress for all files
    const newProgress = new Map<string, FileUploadProgress>();
    for (const file of nonEmptyFiles) {
      newProgress.set(file.name, {
        fileName: file.name,
        percentage: 0,
        status: 'uploading',
      });
    }
    setFileUploadProgress(newProgress);

    for (let i = 0; i < nonEmptyFiles.length; i++) {
      const file = nonEmptyFiles[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
          setFileUploadProgress(prev => {
            const updated = new Map(prev);
            const current = updated.get(file.name);
            if (current) {
              updated.set(file.name, { ...current, percentage });
            }
            return updated;
          });
        });

        await addFile.mutateAsync({
          id: generateSecure32ByteId(),
          name: file.name,
          size: BigInt(file.size),
          blob,
          parentId: currentFolderId,
        });

        // Mark as complete
        setFileUploadProgress(prev => {
          const updated = new Map(prev);
          const current = updated.get(file.name);
          if (current) {
            updated.set(file.name, { ...current, percentage: 100, status: 'complete' });
          }
          return updated;
        });

        toast.success(`${file.name} uploaded successfully`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        // Mark as error
        setFileUploadProgress(prev => {
          const updated = new Map(prev);
          const current = updated.get(file.name);
          if (current) {
            updated.set(file.name, { ...current, status: 'error' });
          }
          return updated;
        });
        
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }
    }

    // Clear progress after a short delay
    setTimeout(() => {
      setFileUploadProgress(new Map());
    }, 2000);

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
      // Initialize progress for all files
      const newProgress = new Map<string, FileUploadProgress>();
      for (const folderFile of folderFiles) {
        newProgress.set(folderFile.file.name, {
          fileName: folderFile.file.name,
          percentage: 0,
          status: 'uploading',
        });
      }
      setFileUploadProgress(newProgress);

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setFileUploadProgress(prev => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
      });

      // Mark all as complete
      setFileUploadProgress(prev => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: 'complete' });
        }
        return updated;
      });

      toast.success('Folder uploaded successfully');
      
      // Clear progress after a short delay
      setTimeout(() => {
        setFileUploadProgress(new Map());
      }, 2000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Folder upload failed';
      toast.error(errorMessage);
      
      // Mark all as error
      setFileUploadProgress(prev => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, status: 'error' });
        }
        return updated;
      });
    } finally {
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

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer || !dataTransfer.items || dataTransfer.items.length === 0) return;

    try {
      const folderFiles = await extractDroppedFiles(dataTransfer);
      
      if (folderFiles.length === 0) {
        toast.error('No files found in the dropped items');
        return;
      }

      // Initialize progress for all files
      const newProgress = new Map<string, FileUploadProgress>();
      for (const folderFile of folderFiles) {
        newProgress.set(folderFile.file.name, {
          fileName: folderFile.file.name,
          percentage: 0,
          status: 'uploading',
        });
      }
      setFileUploadProgress(newProgress);

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setFileUploadProgress(prev => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
      });

      // Mark all as complete
      setFileUploadProgress(prev => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: 'complete' });
        }
        return updated;
      });

      toast.success('Files uploaded successfully');
      
      // Clear progress after a short delay
      setTimeout(() => {
        setFileUploadProgress(new Map());
      }, 2000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMessage);
      
      // Mark all as error
      setFileUploadProgress(prev => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, status: 'error' });
        }
        return updated;
      });
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

  const handleCopyLink = useCallback(async (file: FileMetadata) => {
    await copyFileLink(file);
  }, []);

  const handleDownload = useCallback(async (file: FileMetadata) => {
    await downloadFile(file);
  }, []);

  const isUploading = fileUploadProgress.size > 0;

  return (
    <TooltipProvider>
      <div
        className="space-y-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center space-x-2 text-sm">
          {folderPath.map((segment, index) => (
            <React.Fragment key={segment.id || 'root'}>
              {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="breadcrumb-link"
              >
                {segment.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Search and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Single View Toggle Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode(currentFolderId, currentViewMode === 'list' ? 'gallery' : 'list')}
                  aria-label={currentViewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View'}
                >
                  {currentViewMode === 'list' ? (
                    <LayoutGrid className="h-4 w-4" />
                  ) : (
                    <LayoutList className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {currentViewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View'}
              </TooltipContent>
            </Tooltip>

            {/* Upload Files Button */}
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-background text-foreground border-2 border-blue-500 hover:bg-accent hover:text-accent-foreground"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />

            {/* New Folder Button */}
            <Button
              onClick={() => setShowCreateFolder(true)}
              className="bg-background text-foreground border-2 border-yellow-500 hover:bg-accent hover:text-accent-foreground"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>

            {/* Upload Folder Button */}
            <Button
              onClick={() => folderInputRef.current?.click()}
              className="bg-background text-foreground border-2 border-yellow-500 hover:bg-accent hover:text-accent-foreground"
            >
              <FolderUp className="h-4 w-4 mr-2" />
              Upload Folder
            </Button>
            <input
              ref={folderInputRef}
              type="file"
              /* @ts-ignore - webkitdirectory is not in the type definition */
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium">Uploading files...</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from(fileUploadProgress.values()).map((progress) => (
                <div key={progress.fileName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[70%]" title={progress.fileName}>
                      {progress.fileName}
                    </span>
                    <span className="text-muted-foreground">
                      {progress.status === 'complete' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : progress.status === 'error' ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        `${progress.percentage}%`
                      )}
                    </span>
                  </div>
                  <Progress value={progress.percentage} className="h-1" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Multi-select Actions */}
        {selectedItems.size > 0 && (
          <Card className="bg-muted/50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedItems.size} item(s) selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkMove(true)}
                  >
                    <MoveRight className="h-4 w-4 mr-2" />
                    Move
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Drag and Drop Overlay */}
        {isDragging && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-center">
              <Upload className="h-16 w-16 mx-auto mb-4 text-primary" />
              <p className="text-xl font-semibold">Drop files or folders here</p>
            </div>
          </div>
        )}

        {/* File List or Gallery */}
        {currentViewMode === 'list' ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <FileListHeaderRow
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onSelectAll={handleSelectAll}
                  showLocationColumn={isSearchActive}
                />
                <tbody>
                  {isLoading || searchLoading ? (
                    <tr>
                      <td colSpan={isSearchActive ? 6 : 5} className="p-8">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={isSearchActive ? 6 : 5} className="p-8 text-center text-destructive">
                        Error loading files: {error.message}
                      </td>
                    </tr>
                  ) : !displayItems || displayItems.length === 0 ? (
                    <tr>
                      <td colSpan={isSearchActive ? 6 : 5} className="p-8 text-center text-muted-foreground">
                        {isSearchActive ? 'No results found' : 'No files or folders yet'}
                      </td>
                    </tr>
                  ) : (
                    displayItems.map((item) => {
                      const isFolder = item.__kind__ === 'folder';
                      const data = isFolder ? item.folder : item.file;
                      const itemId = data.id;
                      const isSelected = selectedItems.has(itemId);

                      return (
                        <tr
                          key={itemId}
                          className="border-t hover:bg-muted/50 transition-colors"
                        >
                          {/* Selection Checkbox */}
                          <td className="p-3 w-12">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
                              aria-label={`Select ${data.name}`}
                            />
                          </td>

                          {/* Name */}
                          <td className="p-3">
                            <button
                              onClick={() => isFolder ? handleFolderClick(item.folder) : handleFileClick(item.file)}
                              className="flex items-center gap-3 text-left w-full group"
                            >
                              {isFolder ? (
                                <Folder className="h-5 w-5 text-primary shrink-0" />
                              ) : (
                                <File className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <span 
                                className="font-medium group-hover:text-primary transition-colors truncate max-w-xs"
                                title={data.name}
                              >
                                {data.name}
                              </span>
                            </button>
                          </td>

                          {/* Location (only in search mode) */}
                          {isSearchActive && (
                            <td className="p-3 text-sm text-muted-foreground">
                              <button
                                onClick={(e) => handleSearchResultPathClick(item, e)}
                                className="hover:text-foreground transition-colors flex items-center gap-1 truncate max-w-xs"
                                title="Click to navigate to containing folder"
                              >
                                <ChevronRight className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {isFolder 
                                    ? getFolderContainingPath(item.folder.parentId, allFolders || [])
                                    : getContainingFolderPath(item.file.parentId, allFolders || [])
                                  }
                                </span>
                              </button>
                            </td>
                          )}

                          {/* Type */}
                          <td className="p-3 text-center">
                            {isFolder ? (
                              <Badge className={getFolderTintClasses()}>
                                Folder
                              </Badge>
                            ) : (() => {
                              const typeLabel = getFileTypeLabel(data.name);
                              const category = getFileCategory(data.name);
                              const tintClasses = typeLabel === 'N/A' 
                                ? getUnknownTypeTintClasses()
                                : getFileTypeTintClasses(category);
                              return (
                                <Badge className={tintClasses}>
                                  {typeLabel}
                                </Badge>
                              );
                            })()}
                          </td>

                          {/* Created */}
                          <td className="p-3 text-sm text-muted-foreground text-center">
                            {formatCompactTimestamp(data.createdAt)}
                          </td>

                          {/* Size */}
                          <td className="p-3 text-sm text-muted-foreground text-center">
                            {isFolder ? '—' : formatFileSize(item.file.size)}
                          </td>

                          {/* Actions */}
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              {!isFolder && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDownload(item.file)}
                                        className="h-8 w-8"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Download</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleCopyLink(item.file)}
                                        className="h-8 w-8"
                                      >
                                        <Link2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy Link</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setItemToMove({ id: itemId, name: data.name, isFolder })}
                                    className="h-8 w-8"
                                  >
                                    <MoveRight className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Move</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setItemToDelete({ id: itemId, name: data.name, isFolder })}
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <FileGallery
            items={displayItems || []}
            isLoading={isLoading || searchLoading}
            error={error}
            isSearchActive={isSearchActive}
            selectedItems={selectedItems}
            onSelectItem={handleSelectItem}
            onFolderClick={handleFolderClick}
            onFileClick={handleFileClick}
            onDownload={handleDownload}
            onCopyLink={handleCopyLink}
            onMove={(id, name, isFolder) => setItemToMove({ id, name, isFolder })}
            onDelete={(id, name, isFolder) => setItemToDelete({ id, name, isFolder })}
            onSearchResultPathClick={handleSearchResultPathClick}
            allFolders={allFolders || []}
          />
        )}

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
                This will permanently delete {itemToDelete?.isFolder ? 'the folder' : 'the file'} "{itemToDelete?.name}"
                {itemToDelete?.isFolder && ' and all its contents'}.
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
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedItems.size} item(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected items and all their contents.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteFile.isPending || deleteFolder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete All'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Move Dialog */}
        <Dialog open={!!itemToMove} onOpenChange={() => setItemToMove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move "{itemToMove?.name}"</DialogTitle>
              <DialogDescription>
                Select a destination folder
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

        {/* Bulk Move Dialog */}
        <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {selectedItems.size} item(s)</DialogTitle>
              <DialogDescription>
                Select a destination folder
              </DialogDescription>
            </DialogHeader>
            <Select
              value={bulkMoveDestination || 'root'}
              onValueChange={(value) => setBulkMoveDestination(value === 'root' ? null : value)}
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
              <Button variant="outline" onClick={() => setShowBulkMove(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkMoveConfirm} disabled={moveItems.isPending}>
                {moveItems.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Moving...
                  </>
                ) : (
                  'Move All'
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
            allFiles={allFilesInContext}
            currentFileIndex={currentFileIndex}
            onNavigateFile={handleNavigateFile}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
