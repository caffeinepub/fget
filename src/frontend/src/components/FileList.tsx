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

export function FileList({ currentFolderId, onFolderNavigate }: FileListProps) {
  const [searchTerm, setSearchTerm] = useState('');
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

    setUploadingFiles(nonEmptyFiles.map(f => f.name));

    for (let i = 0; i < nonEmptyFiles.length; i++) {
      const file = nonEmptyFiles[i];
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
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setUploadProgress(percentage);
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

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer || !dataTransfer.items || dataTransfer.items.length === 0) return;

    try {
      const folderFiles = await extractDroppedFiles(dataTransfer);
      
      if (folderFiles.length === 0) {
        toast.error('No files found in the dropped items');
        return;
      }

      setUploadingFiles(folderFiles.map(f => f.file.name));

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setUploadProgress(percentage);
        },
      });

      toast.success('Files uploaded successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMessage);
    } finally {
      setUploadingFiles([]);
      setUploadProgress(0);
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Error loading files: {error.message}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 text-sm flex-1">
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
        </div>

        {/* Search and actions bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
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

          {/* View mode toggle buttons - NO TOOLTIPS on these three buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={currentViewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode(currentFolderId, 'list')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={currentViewMode === 'gallery' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode(currentFolderId, 'gallery')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-500"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreateFolder(true)}
            className="text-orange-500"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            className="text-orange-500"
          >
            <FolderUp className="h-4 w-4 mr-2" />
            Upload Folder
          </Button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore - webkitdirectory is not in the types
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderUpload}
          className="hidden"
        />

        {/* Bulk actions bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground flex-1">
              {selectedItems.size} item(s) selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkMove(true)}
            >
              <MoveRight className="h-4 w-4 mr-2" />
              Move
            </Button>
            <Button
              variant="destructive"
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
        )}

        {/* Upload progress */}
        {uploadingFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Uploading {uploadingFiles.length} file(s)...
                </span>
                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={uploadProgress} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Drag and drop overlay */}
        {isDragging && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-primary rounded-lg bg-card">
              <Upload className="h-16 w-16 text-primary" />
              <p className="text-lg font-medium">Drop files or folders here</p>
            </div>
          </div>
        )}

        {/* File list or gallery view */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {currentViewMode === 'list' ? (
            <div className="border rounded-lg overflow-hidden">
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
                  <tbody className="divide-y divide-border">
                    {isLoading ? (
                      <tr>
                        <td colSpan={isSearchActive ? 7 : 6} className="text-center py-8 text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </td>
                      </tr>
                    ) : displayItems && displayItems.length === 0 ? (
                      <tr>
                        <td colSpan={isSearchActive ? 7 : 6} className="text-center py-8 text-muted-foreground">
                          {isSearchActive ? 'No results found' : 'No files or folders'}
                        </td>
                      </tr>
                    ) : (
                      displayItems?.map((item) => {
                        const isFolder = item.__kind__ === 'folder';
                        const id = isFolder ? item.folder.id : item.file.id;
                        const name = isFolder ? item.folder.name : item.file.name;
                        const createdAt = isFolder ? item.folder.createdAt : item.file.createdAt;
                        const size = isFolder ? null : item.file.size;
                        const isSelected = selectedItems.has(id);

                        const typeLabel = isFolder ? 'Folder' : getFileTypeLabel(name);
                        const category = isFolder ? null : getFileCategory(name);
                        const tintClasses = isFolder
                          ? getFolderTintClasses()
                          : typeLabel === 'N/A'
                          ? getUnknownTypeTintClasses()
                          : getFileTypeTintClasses(category!);

                        return (
                          <tr key={id} className="hover:bg-muted/50">
                            <td className="p-4 w-12">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleSelectItem(id, checked as boolean)}
                              />
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => {
                                  if (isFolder) {
                                    handleFolderClick(item.folder);
                                  } else {
                                    handleFileClick(item.file);
                                  }
                                }}
                                className="text-left hover:underline font-medium"
                                title={name}
                              >
                                {name}
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${tintClasses}`}>
                                {typeLabel}
                              </span>
                            </td>
                            {isSearchActive && (
                              <td className="p-4">
                                <button
                                  onClick={(e) => handleSearchResultPathClick(item, e)}
                                  className="breadcrumb-link text-sm"
                                >
                                  {isFolder 
                                    ? getFolderContainingPath(item.folder.parentId, allFolders || [])
                                    : getContainingFolderPath(item.file.parentId, allFolders || [])
                                  }
                                </button>
                              </td>
                            )}
                            <td className="p-4 text-center text-muted-foreground">
                              {formatCompactTimestamp(createdAt)}
                            </td>
                            <td className="p-4 text-center text-muted-foreground">
                              {size !== null ? formatFileSize(size) : '—'}
                            </td>
                            <td className="p-4 w-[160px]">
                              <div className="flex items-center justify-end gap-1">
                                {!isFolder && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDownload(item.file)}
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
                                        >
                                          <Link2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy link</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                                {isFolder && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleFolderClick(item.folder)}
                                      >
                                        <ChevronRight className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Open folder</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setItemToMove({ id, name, isFolder });
                                        setMoveDestination(null);
                                      }}
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
                                      onClick={() => setItemToDelete({ id, name, isFolder })}
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
            </div>
          ) : (
            <FileGallery
              items={displayItems || []}
              isLoading={isLoading}
              error={error}
              isSearchActive={isSearchActive}
              selectedItems={selectedItems}
              onSelectItem={handleSelectItem}
              onFolderClick={handleFolderClick}
              onFileClick={handleFileClick}
              onDownload={handleDownload}
              onCopyLink={handleCopyLink}
              onMove={(id, name, isFolder) => {
                setItemToMove({ id, name, isFolder });
                setMoveDestination(null);
              }}
              onDelete={(id, name, isFolder) => setItemToDelete({ id, name, isFolder })}
              onSearchResultPathClick={handleSearchResultPathClick}
              allFolders={allFolders || []}
            />
          )}
        </div>

        {/* File preview modal */}
        <FilePreviewModal
          file={previewFile}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          allFiles={allFilesInContext}
          currentFileIndex={currentFileIndex}
          onNavigateFile={handleNavigateFile}
        />

        {/* Create folder dialog */}
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
              <Button onClick={handleCreateFolder}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{itemToDelete?.name}"?
                {itemToDelete?.isFolder && ' This will delete all contents of the folder.'}
                {' '}This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Move item dialog */}
        <Dialog open={!!itemToMove} onOpenChange={(open) => !open && setItemToMove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move Item</DialogTitle>
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
                <SelectItem value="root">Root (Drive)</SelectItem>
                {allFolders?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {getFolderPathString(folder.id, allFolders)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemToMove(null)}>
                Cancel
              </Button>
              <Button onClick={handleMoveConfirm}>Move</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk delete confirmation dialog */}
        <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedItems.size} item(s)?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk move dialog */}
        <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move Items</DialogTitle>
              <DialogDescription>
                Select a destination folder for {selectedItems.size} item(s)
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
                <SelectItem value="root">Root (Drive)</SelectItem>
                {allFolders?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {getFolderPathString(folder.id, allFolders)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkMove(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkMoveConfirm}>Move</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
