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
        targetFolderId = item.folder.parentId || null;
      } else {
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
        newParentId: bulkMoveDestination ?? undefined,
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

    if (emptyFiles.length > 0) {
      if (emptyFiles.length === 1) {
        toast.info(`Skipped empty file: ${emptyFiles[0]}`);
      } else {
        toast.info(`Skipped ${emptyFiles.length} empty files`);
      }
    }

    if (nonEmptyFiles.length === 0) {
      toast.info('No non-empty files to upload');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

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

      setFileUploadProgress(prev => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: 'complete' });
        }
        return updated;
      });

      toast.success('Folder uploaded successfully');

      setTimeout(() => {
        setFileUploadProgress(new Map());
      }, 2000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(`Failed to upload folder: ${errorMessage}`);
      setFileUploadProgress(new Map());
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

    const droppedFiles = await extractDroppedFiles(e.dataTransfer);

    if (droppedFiles.length === 0) return;

    // Check if any files have folder structure (relative paths with /)
    const hasFolderStructure = droppedFiles.some(f => f.relativePath.includes('/'));

    if (hasFolderStructure) {
      // Upload as folder structure
      try {
        const newProgress = new Map<string, FileUploadProgress>();
        for (const droppedFile of droppedFiles) {
          newProgress.set(droppedFile.file.name, {
            fileName: droppedFile.file.name,
            percentage: 0,
            status: 'uploading',
          });
        }
        setFileUploadProgress(newProgress);

        await uploadFolderRecursively(droppedFiles, currentFolderId, {
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

        setFileUploadProgress(prev => {
          const updated = new Map(prev);
          for (const [key, value] of updated.entries()) {
            updated.set(key, { ...value, percentage: 100, status: 'complete' });
          }
          return updated;
        });

        toast.success('Folder uploaded successfully');

        setTimeout(() => {
          setFileUploadProgress(new Map());
        }, 2000);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        toast.error(`Failed to upload folder: ${errorMessage}`);
        setFileUploadProgress(new Map());
      }
    } else {
      // Upload as individual files
      const fileList = droppedFiles.map(f => f.file);
      const nonEmptyFiles = fileList.filter(f => f.size > 0);
      const emptyCount = fileList.length - nonEmptyFiles.length;

      if (emptyCount > 0) {
        toast.info(`Skipped ${emptyCount} empty file${emptyCount > 1 ? 's' : ''}`);
      }

      if (nonEmptyFiles.length === 0) return;

      const newProgress = new Map<string, FileUploadProgress>();
      for (const file of nonEmptyFiles) {
        newProgress.set(file.name, { fileName: file.name, percentage: 0, status: 'uploading' });
      }
      setFileUploadProgress(newProgress);

      for (const file of nonEmptyFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setFileUploadProgress(prev => {
              const updated = new Map(prev);
              const current = updated.get(file.name);
              if (current) updated.set(file.name, { ...current, percentage });
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

          setFileUploadProgress(prev => {
            const updated = new Map(prev);
            const current = updated.get(file.name);
            if (current) updated.set(file.name, { ...current, percentage: 100, status: 'complete' });
            return updated;
          });

          toast.success(`${file.name} uploaded successfully`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          setFileUploadProgress(prev => {
            const updated = new Map(prev);
            const current = updated.get(file.name);
            if (current) updated.set(file.name, { ...current, status: 'error' });
            return updated;
          });
          toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
        }
      }

      setTimeout(() => setFileUploadProgress(new Map()), 2000);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getFileIcon = (fileName: string) => {
    const category = getFileCategory(fileName);
    switch (category) {
      case 'image': return <FileImage className="h-4 w-4 shrink-0" />;
      case 'video': return <FileVideo className="h-4 w-4 shrink-0" />;
      case 'audio': return <FileAudio className="h-4 w-4 shrink-0" />;
      case 'archive': return <FileArchive className="h-4 w-4 shrink-0" />;
      case 'document': return <FileText className="h-4 w-4 shrink-0" />;
      case 'code': return <FileCode className="h-4 w-4 shrink-0" />;
      default: return <File className="h-4 w-4 shrink-0" />;
    }
  };

  const isUploadActive = fileUploadProgress.size > 0;

  return (
    <TooltipProvider>
      <div
        className={`relative ${isDragging ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 rounded-lg border-2 border-dashed border-primary pointer-events-none">
            <div className="text-center">
              <Upload className="h-12 w-12 mx-auto text-primary mb-2" />
              <p className="text-lg font-semibold text-primary">Drop files here to upload</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            {/* Breadcrumb navigation */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3 flex-wrap">
              {folderPath.map((segment, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                  {index < folderPath.length - 1 ? (
                    <button
                      onClick={() => handleBreadcrumbClick(index)}
                      className="breadcrumb-link"
                    >
                      {segment.name}
                    </button>
                  ) : (
                    <span className="font-medium text-foreground">{segment.name}</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search files and folders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-9 h-9"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Upload Files — light blue filled background, native border */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-900 border-border dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-100 dark:border-border"
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    Upload Files
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload one or more files to the current folder</TooltipContent>
              </Tooltip>

              {/* New Folder — light yellow filled background, native border */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateFolder(true)}
                    className="bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border-border dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 dark:text-yellow-100 dark:border-border"
                  >
                    <FolderPlus className="h-4 w-4 mr-1.5" />
                    New Folder
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create a new folder in the current location</TooltipContent>
              </Tooltip>

              {/* Upload Folder — light yellow filled background, native border */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => folderInputRef.current?.click()}
                    className="bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border-border dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 dark:text-yellow-100 dark:border-border"
                  >
                    <FolderUp className="h-4 w-4 mr-1.5" />
                    Upload Folder
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload an entire folder with its structure</TooltipContent>
              </Tooltip>

              {/* View toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode(currentFolderId, currentViewMode === 'list' ? 'gallery' : 'list')}
                  >
                    {currentViewMode === 'list' ? (
                      <><LayoutGrid className="h-4 w-4 mr-1.5" />Gallery</>
                    ) : (
                      <><LayoutList className="h-4 w-4 mr-1.5" />List</>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {currentViewMode === 'list' ? 'Switch to gallery view' : 'Switch to list view'}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Bulk action bar */}
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded-md">
                <span className="text-sm font-medium">{selectedItems.size} selected</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkMove(true)}
                >
                  <MoveRight className="h-4 w-4 mr-1.5" />
                  Move
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkDelete(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear
                </Button>
              </div>
            )}

            {/* Upload progress */}
            {isUploadActive && (
              <div className="mt-2 space-y-1">
                {Array.from(fileUploadProgress.entries()).map(([fileName, progress]) => (
                  <div key={fileName} className="flex items-center gap-2 text-sm">
                    {progress.status === 'uploading' && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />}
                    {progress.status === 'complete' && <Check className="h-3 w-3 shrink-0 text-green-500" />}
                    {progress.status === 'error' && <X className="h-3 w-3 shrink-0 text-destructive" />}
                    <span className="truncate flex-1 text-muted-foreground">{fileName}</span>
                    {progress.status === 'uploading' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Progress value={progress.percentage} className="w-20 h-1.5" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{progress.percentage}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-0">
            {isLoading || (isSearchActive && searchLoading) ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Error loading files: {(error as Error).message}
              </div>
            ) : currentViewMode === 'gallery' ? (
              <FileGallery
                items={displayItems || []}
                isLoading={false}
                error={null}
                isSearchActive={isSearchActive}
                selectedItems={selectedItems}
                onSelectItem={handleSelectItem}
                onFolderClick={handleFolderClick}
                onFileClick={handleFileClick}
                onDownload={async (file) => { await downloadFile(file); }}
                onCopyLink={async (file) => { await copyFileLink(file); }}
                onMove={(id, name, isFolder) => setItemToMove({ id, name, isFolder })}
                onDelete={(id, name, isFolder) => setItemToDelete({ id, name, isFolder })}
                onSearchResultPathClick={handleSearchResultPathClick}
                allFolders={allFolders || []}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <FileListHeaderRow
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onSelectAll={handleSelectAll}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    showLocationColumn={isSearchActive}
                  />
                  <tbody className="divide-y divide-border">
                    {!displayItems || displayItems.length === 0 ? (
                      <tr>
                        <td colSpan={isSearchActive ? 7 : 6} className="text-center py-12 text-muted-foreground">
                          {isSearchActive ? 'No results found' : 'No files or folders yet'}
                        </td>
                      </tr>
                    ) : (
                      displayItems.map((item) => {
                        const isFolder = item.__kind__ === 'folder';
                        const data = isFolder ? item.folder : item.file;
                        const itemId = data.id;
                        const isItemSelected = selectedItems.has(itemId);

                        return (
                          <tr
                            key={itemId}
                            className={`hover:bg-muted/50 transition-colors ${isItemSelected ? 'bg-muted/30' : ''}`}
                          >
                            {/* Checkbox */}
                            <td className="p-4 w-12">
                              <Checkbox
                                checked={isItemSelected}
                                onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
                                aria-label={`Select ${data.name}`}
                              />
                            </td>

                            {/* Name */}
                            <td className="p-4">
                              <button
                                onClick={() => isFolder ? handleFolderClick(item.folder) : handleFileClick(item.file)}
                                className="flex items-center gap-2 hover:text-primary transition-colors text-left w-full"
                              >
                                {isFolder ? (
                                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                                ) : (
                                  getFileIcon(data.name)
                                )}
                                <span className="truncate max-w-[200px]" title={data.name}>
                                  {data.name}
                                </span>
                              </button>
                            </td>

                            {/* Type */}
                            <td className="p-4 text-center">
                              {isFolder ? (
                                <Badge variant="outline" className={getFolderTintClasses()}>
                                  Folder
                                </Badge>
                              ) : (
                                (() => {
                                  const ext = getFileTypeLabel(data.name);
                                  const tintClasses = ext === 'N/A'
                                    ? getUnknownTypeTintClasses()
                                    : getFileTypeTintClasses(getFileCategory(data.name));
                                  return (
                                    <Badge variant="outline" className={tintClasses}>
                                      {ext}
                                    </Badge>
                                  );
                                })()
                              )}
                            </td>

                            {/* Location (search mode only) */}
                            {isSearchActive && (
                              <td className="p-4 text-center">
                                <button
                                  onClick={(e) => handleSearchResultPathClick(item, e)}
                                  className="breadcrumb-link text-xs"
                                  title="Navigate to containing folder"
                                >
                                  {isFolder
                                    ? getFolderContainingPath(item.folder.parentId, allFolders || [])
                                    : getContainingFolderPath(item.file.parentId, allFolders || [])
                                  }
                                </button>
                              </td>
                            )}

                            {/* Created */}
                            <td className="p-4 text-center text-sm text-muted-foreground whitespace-nowrap">
                              {formatCompactTimestamp(data.createdAt)}
                            </td>

                            {/* Size */}
                            <td className="p-4 text-center text-sm text-muted-foreground whitespace-nowrap">
                              {isFolder ? '—' : formatFileSize((item.file as FileMetadata).size)}
                            </td>

                            {/* Actions */}
                            <td className="p-4 w-[160px]">
                              <div className="flex items-center justify-center gap-1">
                                {!isFolder && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => downloadFile(item.file)}
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Download file</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => copyFileLink(item.file)}
                                        >
                                          <Link2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy link</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setItemToMove({ id: itemId, name: data.name, isFolder })}
                                    >
                                      <MoveRight className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Move item</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => setItemToDelete({ id: itemId, name: data.name, isFolder })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete item</TooltipContent>
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
          // @ts-expect-error webkitdirectory not in standard types
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handleFolderUpload}
        />

        {/* Create Folder Dialog */}
        <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <DialogDescription>Enter a name for the new folder.</DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={createFolder.isPending || !newFolderName.trim()}>
                {createFolder.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{itemToDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {itemToDelete?.isFolder
                  ? 'This will permanently delete the folder and all its contents. This action cannot be undone.'
                  : 'This will permanently delete the file. This action cannot be undone.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {(deleteFile.isPending || deleteFolder.isPending) ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
                ) : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Move Item Dialog */}
        <Dialog open={!!itemToMove} onOpenChange={(open) => !open && setItemToMove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move "{itemToMove?.name}"</DialogTitle>
              <DialogDescription>Select a destination folder.</DialogDescription>
            </DialogHeader>
            <Select
              value={moveDestination ?? 'root'}
              onValueChange={(val) => setMoveDestination(val === 'root' ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Drive (root)</SelectItem>
                {(allFolders || [])
                  .filter(f => f.id !== itemToMove?.id)
                  .map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {getFolderPathString(folder.id, allFolders || [])}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemToMove(null)}>Cancel</Button>
              <Button onClick={handleMoveConfirm} disabled={moveItem.isPending}>
                {moveItem.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Moving...</> : 'Move'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedItems.size} item(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all selected items. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Move Dialog */}
        <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {selectedItems.size} item(s)</DialogTitle>
              <DialogDescription>Select a destination folder for all selected items.</DialogDescription>
            </DialogHeader>
            <Select
              value={bulkMoveDestination ?? 'root'}
              onValueChange={(val) => setBulkMoveDestination(val === 'root' ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Drive (root)</SelectItem>
                {(allFolders || []).map(folder => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {getFolderPathString(folder.id, allFolders || [])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkMove(false)}>Cancel</Button>
              <Button onClick={handleBulkMoveConfirm} disabled={moveItems.isPending}>
                {moveItems.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Moving...</> : 'Move All'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Preview Modal */}
        {showPreview && previewFile && (
          <FilePreviewModal
            file={previewFile}
            isOpen={showPreview}
            onClose={() => { setShowPreview(false); setPreviewFile(null); }}
            allFiles={allFilesInContext}
            currentFileIndex={currentFileIndex}
            onNavigateFile={handleNavigateFile}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
