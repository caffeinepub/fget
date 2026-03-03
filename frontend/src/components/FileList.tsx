import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Archive,
  Link2,
  Check,
  Loader2,
  Trash2,
  Search,
  Folder,
  FolderPlus,
  MoveRight,
  ChevronRight,
  Upload,
  FolderUp,
  X,
  FileCode,
  FileQuestion,
  LayoutList,
  LayoutGrid,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileType,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useGetFolderContents,
  useDeleteFile,
  useDeleteFolder,
  useCreateFolder,
  useMoveItem,
  useMoveItems,
  useGetAllFolders,
  useAddFile,
  useSearchSubtree,
} from '../hooks/useQueries';
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
import {
  getFileExtension,
  getMimeType,
  isPreviewable,
  isImage,
  getFileTypeLabel,
  getFileCategory,
  type FileCategory,
} from '../lib/fileTypes';
import { copyFileLink, downloadFile } from '../lib/fileLinks';
import { uploadFolderRecursively, extractFolderFiles, validateFolderFiles } from '../lib/folderUpload';
import { extractDroppedFiles } from '../lib/dragDropDirectory';
import {
  resolvePathSegment,
  buildBreadcrumbPath,
  resolveFileParentPath,
  getContainingFolderPath,
  getFolderContainingPath,
  getFolderPathString,
} from '../lib/folderNavigation';
import { sortFileSystemItems, type SortField, type SortDirection } from '../lib/sortFileSystemItems';
import { formatCompactTimestamp } from '../lib/formatTime';
import { formatFileSize } from '../lib/formatFileSize';
import { FileListHeaderRow } from './FileListHeaderRow';
import { generateSecure32ByteId } from '../lib/id';
import { usePerFolderViewMode, type ViewMode } from '../hooks/usePerFolderViewMode';
import {
  getFileTypeTintClasses,
  getFolderTintClasses,
  getUnknownTypeTintClasses,
} from '../lib/fileTypeTints';

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
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Drive' },
  ]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<Map<string, FileUploadProgress>>(
    new Map()
  );
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
  const { data: searchResults, isLoading: searchLoading } = useSearchSubtree(
    searchTerm,
    currentFolderId
  );
  const { data: allFolders } = useGetAllFolders();
  const createFolder = useCreateFolder();
  const addFile = useAddFile();

  // Determine if we're in search mode
  const isSearchActive = searchTerm.trim().length > 0;

  const deleteFile = useDeleteFile();
  const deleteFolder = useDeleteFolder();
  const moveItem = useMoveItem();
  const moveItems = useMoveItems();

  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    name: string;
    isFolder: boolean;
  } | null>(null);
  const [itemToMove, setItemToMove] = useState<{
    id: string;
    name: string;
    isFolder: boolean;
  } | null>(null);
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
      .filter(
        (item): item is { __kind__: 'file'; file: FileMetadata } => item.__kind__ === 'file'
      )
      .map((item) => item.file);
  }, [displayItems]);

  const handleFileClick = useCallback(
    (file: FileMetadata) => {
      const fileIndex = allFilesInContext.findIndex((f) => f.id === file.id);
      if (fileIndex !== -1) {
        setCurrentFileIndex(fileIndex);
        setPreviewFile(file);
        setShowPreview(true);
      }
    },
    [allFilesInContext]
  );

  const handleNavigateFile = useCallback(
    (index: number) => {
      if (allFilesInContext.length === 0 || index < 0 || index >= allFilesInContext.length) return;
      setCurrentFileIndex(index);
      setPreviewFile(allFilesInContext[index]);
    },
    [allFilesInContext]
  );

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

      const targetName =
        targetFolderId === null
          ? 'Drive'
          : allFolders.find((f) => f.id === targetFolderId)?.name || 'folder';
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
      const allIds = new Set(
        displayItems.map((item) => (item.__kind__ === 'file' ? item.file.id : item.folder.id))
      );
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
      const itemsToDelete =
        displayItems?.filter((item) => {
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
      const itemsToMove =
        displayItems?.filter((item) => {
          const id = item.__kind__ === 'file' ? item.file.id : item.folder.id;
          return selectedItems.has(id);
        }) || [];

      const moves: FileMove[] = itemsToMove.map((item) => ({
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

  const allSelected = Boolean(
    displayItems && displayItems.length > 0 && selectedItems.size === displayItems.length
  );
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
          setFileUploadProgress((prev) => {
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

        setFileUploadProgress((prev) => {
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

        setFileUploadProgress((prev) => {
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
      toast.error(
        'Browser does not support folder upload with structure. Please try drag-and-drop instead.'
      );
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
          setFileUploadProgress((prev) => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
      });

      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: 'complete' });
        }
        return updated;
      });

      toast.success('Folder uploaded successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Folder upload failed';
      toast.error(errorMessage);
    }

    setTimeout(() => {
      setFileUploadProgress(new Map());
    }, 2000);

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    try {
      const droppedFiles = await extractDroppedFiles(e.dataTransfer);

      if (droppedFiles.length === 0) {
        toast.error('No files found in the dropped items');
        return;
      }

      const newProgress = new Map<string, FileUploadProgress>();
      for (const { file } of droppedFiles) {
        if (file.size > 0) {
          newProgress.set(file.name, {
            fileName: file.name,
            percentage: 0,
            status: 'uploading',
          });
        }
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
          setFileUploadProgress((prev) => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
      });

      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: 'complete' });
        }
        return updated;
      });

      toast.success('Files uploaded successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMessage);
    }

    setTimeout(() => {
      setFileUploadProgress(new Map());
    }, 2000);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getItemTypeBadge = (item: FileSystemItem) => {
    if (item.__kind__ === 'folder') {
      return (
        <Badge variant="outline" className={getFolderTintClasses()}>
          Folder
        </Badge>
      );
    }
    const category = getFileCategory(item.file.name);
    const label = getFileTypeLabel(item.file.name);
    const tintClass = category ? getFileTypeTintClasses(category) : getUnknownTypeTintClasses();
    return (
      <Badge variant="outline" className={tintClass}>
        {label}
      </Badge>
    );
  };

  const uploadProgressEntries = Array.from(fileUploadProgress.entries());
  const isUploading = uploadProgressEntries.some(([, p]) => p.status === 'uploading');

  return (
    <TooltipProvider>
      <div
        className={`space-y-4 ${isDragging ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-1 text-sm flex-wrap">
          {folderPath.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              {index === folderPath.length - 1 ? (
                <span className="font-medium text-foreground">{segment.name}</span>
              ) : (
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className="breadcrumb-link"
                >
                  {segment.name}
                </button>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
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

          {/* View mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setViewMode(currentFolderId, currentViewMode === 'list' ? 'gallery' : 'list')
                }
              >
                {currentViewMode === 'list' ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <LayoutList className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {currentViewMode === 'list' ? 'Switch to gallery view' : 'Switch to list view'}
            </TooltipContent>
          </Tooltip>

          {/* Upload Files — light blue fill, neutral border */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                style={{ backgroundColor: '#eff6ff' }}
                className="border-border text-foreground hover:opacity-90 gap-1.5"
              >
                <Upload className="h-4 w-4" />
                Upload Files
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload one or more files</TooltipContent>
          </Tooltip>

          {/* New Folder — light yellow fill, neutral border */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateFolder(true)}
                style={{ backgroundColor: '#fefce8' }}
                className="border-border text-foreground hover:opacity-90 gap-1.5"
              >
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new folder</TooltipContent>
          </Tooltip>

          {/* Upload Folder — light yellow fill, neutral border */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                style={{ backgroundColor: '#fefce8' }}
                className="border-border text-foreground hover:opacity-90 gap-1.5"
              >
                <FolderUp className="h-4 w-4" />
                Upload Folder
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload an entire folder</TooltipContent>
          </Tooltip>

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
            // @ts-ignore
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFolderUpload}
          />
        </div>

        {/* Bulk actions bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm flex-wrap">
            <span className="text-muted-foreground">{selectedItems.size} selected</span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkMove(true)}
            >
              <MoveRight className="h-4 w-4 mr-1" />
              Move
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowBulkDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Upload progress */}
        {uploadProgressEntries.length > 0 && (
          <div className="space-y-1">
            {uploadProgressEntries.map(([fileName, progress]) => (
              <div key={fileName} className="flex items-center gap-2 text-sm px-3 py-1.5 bg-muted rounded">
                {progress.status === 'uploading' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                )}
                {progress.status === 'complete' && (
                  <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                )}
                {progress.status === 'error' && (
                  <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                )}
                <span className="truncate flex-1">{fileName}</span>
                {progress.status === 'uploading' && (
                  <span className="text-muted-foreground shrink-0">{progress.percentage}%</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Drag overlay hint */}
        {isDragging && (
          <div className="flex items-center justify-center py-8 border-2 border-dashed border-primary rounded-lg bg-primary/5">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="h-8 w-8" />
              <p className="font-medium">Drop files or folders here</p>
            </div>
          </div>
        )}

        {/* File list / gallery */}
        {currentViewMode === 'gallery' ? (
          <FileGallery
            items={displayItems || []}
            isLoading={isLoading || (isSearchActive && searchLoading)}
            error={error as Error | null}
            isSearchActive={isSearchActive}
            selectedItems={selectedItems}
            onSelectItem={handleSelectItem}
            onFolderClick={handleFolderClick}
            onFileClick={handleFileClick}
            onDownload={downloadFile}
            onCopyLink={copyFileLink}
            onMove={(id, name, isFolder) => {
              setItemToMove({ id, name, isFolder });
              setMoveDestination(currentFolderId);
            }}
            onDelete={(id, name, isFolder) => setItemToDelete({ id, name, isFolder })}
            onSearchResultPathClick={handleSearchResultPathClick}
            allFolders={allFolders || []}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <FileListHeaderRow
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onSelectAll={handleSelectAll}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    showLocationColumn={isSearchActive}
                  />
                  <tbody>
                    {(isLoading || (isSearchActive && searchLoading)) ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-4">
                            <Skeleton className="h-4 w-4" />
                          </td>
                          <td className="p-4">
                            <Skeleton className="h-4 w-48" />
                          </td>
                          <td className="p-4">
                            <Skeleton className="h-4 w-16" />
                          </td>
                          {isSearchActive && (
                            <td className="p-4">
                              <Skeleton className="h-4 w-24" />
                            </td>
                          )}
                          <td className="p-4">
                            <Skeleton className="h-4 w-24" />
                          </td>
                          <td className="p-4">
                            <Skeleton className="h-4 w-16" />
                          </td>
                          <td className="p-4">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        </tr>
                      ))
                    ) : !displayItems || displayItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isSearchActive ? 7 : 6}
                          className="p-12 text-center text-muted-foreground"
                        >
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
                            className={`border-t border-border hover:bg-muted/40 transition-colors ${isSelected ? 'bg-muted/60' : ''}`}
                          >
                            {/* Checkbox */}
                            <td className="p-4 w-12">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  handleSelectItem(itemId, checked as boolean)
                                }
                                aria-label={`Select ${data.name}`}
                              />
                            </td>

                            {/* Name */}
                            <td className="p-4">
                              <button
                                className="flex items-center gap-2 hover:underline text-left w-full"
                                onClick={() => {
                                  if (isFolder) {
                                    handleFolderClick(item.folder);
                                  } else {
                                    handleFileClick(item.file);
                                  }
                                }}
                              >
                                {isFolder ? (
                                  <Folder className="h-4 w-4 text-primary shrink-0" />
                                ) : (
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <span
                                  className="truncate max-w-[200px] sm:max-w-[300px]"
                                  title={data.name}
                                >
                                  {data.name}
                                </span>
                              </button>
                            </td>

                            {/* Type */}
                            <td className="p-4">{getItemTypeBadge(item)}</td>

                            {/* Location (search only) */}
                            {isSearchActive && (
                              <td className="p-4">
                                <button
                                  className="breadcrumb-link text-xs"
                                  onClick={(e) => handleSearchResultPathClick(item, e)}
                                >
                                  {isFolder
                                    ? getFolderContainingPath(item.folder.parentId, allFolders || [])
                                    : getContainingFolderPath(item.file.parentId, allFolders || [])}
                                </button>
                              </td>
                            )}

                            {/* Created */}
                            <td className="p-4 text-muted-foreground whitespace-nowrap">
                              {formatCompactTimestamp(data.createdAt)}
                            </td>

                            {/* Size */}
                            <td className="p-4 text-muted-foreground whitespace-nowrap">
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
                                          className="h-7 w-7"
                                          onClick={() => downloadFile(item.file)}
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Download</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => copyFileLink(item.file)}
                                        >
                                          <Link2 className="h-3.5 w-3.5" />
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
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setItemToMove({ id: itemId, name: data.name, isFolder });
                                        setMoveDestination(currentFolderId);
                                      }}
                                    >
                                      <MoveRight className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Move</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() =>
                                        setItemToDelete({ id: itemId, name: data.name, isFolder })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
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
            </CardContent>
          </Card>
        )}

        {/* Delete single item dialog */}
        <AlertDialog
          open={!!itemToDelete}
          onOpenChange={(open) => !open && setItemToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{itemToDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {itemToDelete?.isFolder
                  ? 'This will permanently delete the folder and all its contents.'
                  : 'This will permanently delete the file.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk delete dialog */}
        <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedItems.size} item(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected items and any folder contents.
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

        {/* New folder dialog */}
        <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Folder</DialogTitle>
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
              <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || createFolder.isPending}
              >
                {createFolder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move single item dialog */}
        <Dialog
          open={!!itemToMove}
          onOpenChange={(open) => {
            if (!open) {
              setItemToMove(null);
              setMoveDestination(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Move "{itemToMove?.name}"</DialogTitle>
              <DialogDescription>Select a destination folder.</DialogDescription>
            </DialogHeader>
            <Select
              value={moveDestination ?? '__root__'}
              onValueChange={(val) => setMoveDestination(val === '__root__' ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Drive (root)</SelectItem>
                {(allFolders || [])
                  .filter((f) => !itemToMove?.isFolder || f.id !== itemToMove.id)
                  .map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {getFolderPathString(folder.id, allFolders || [])}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setItemToMove(null);
                  setMoveDestination(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleMoveConfirm} disabled={moveItem.isPending}>
                {moveItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Move Here
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk move dialog */}
        <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Move {selectedItems.size} item(s)</DialogTitle>
              <DialogDescription>Select a destination folder.</DialogDescription>
            </DialogHeader>
            <Select
              value={bulkMoveDestination ?? '__root__'}
              onValueChange={(val) =>
                setBulkMoveDestination(val === '__root__' ? null : val)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Drive (root)</SelectItem>
                {(allFolders || []).map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {getFolderPathString(folder.id, allFolders || [])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkMove(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkMoveConfirm} disabled={moveItems.isPending}>
                {moveItems.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Move Here
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File preview modal */}
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
      </div>
    </TooltipProvider>
  );
}
