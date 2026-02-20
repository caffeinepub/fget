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
import { useState, useMemo, useCallback, useRef } from 'react';
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
import { resolvePathSegment, buildBreadcrumbPath, resolveFileParentPath, getContainingFolderPath, getFolderContainingPath } from '../lib/folderNavigation';
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

  const allSelected = displayItems && displayItems.length > 0 && selectedItems.size === displayItems.length;

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

  const handleClearSearch = () => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleDownload = async (file: FileMetadata) => {
    await downloadFile(file);
  };

  const handleCopyLink = async (file: FileMetadata) => {
    await copyFileLink(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        Error loading files: {error.message}
      </div>
    );
  }

  const someSelected = selectedItems.size > 0 && !allSelected;

  return (
    <div className="space-y-6">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2 text-sm">
        {folderPath.map((segment, index) => (
          <div key={segment.id || 'root'} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <button
              onClick={() => handleBreadcrumbClick(index)}
              className="breadcrumb-link"
            >
              {segment.name}
            </button>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search files and folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10"
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

        <div className="flex items-center gap-2">
          <Button
            variant={currentViewMode === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode(currentFolderId, 'list')}
            title="List view"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={currentViewMode === 'gallery' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode(currentFolderId, 'gallery')}
            title="Gallery view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCreateFolder(true)}
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
          <Button onClick={() => fileInputRef.current?.click()}>
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
          <Button variant="outline" onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="h-4 w-4 mr-2" />
            Upload Folder
          </Button>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is not in TypeScript types
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Search results info */}
      {isSearchActive && (
        <div className="text-sm text-muted-foreground">
          Found {displayItems?.length || 0} results for "{searchTerm}"
        </div>
      )}

      {/* Bulk actions */}
      {selectedItems.size > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm font-medium">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
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
          </CardContent>
        </Card>
      )}

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Uploading {uploadingFiles.length} file(s)...</span>
              <span className="text-muted-foreground">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} />
            <div className="text-xs text-muted-foreground max-h-20 overflow-y-auto">
              {uploadingFiles.map((name, i) => (
                <div key={i}>{name}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File list or gallery */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative ${isDragging ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center">
              <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
              <p className="text-lg font-medium">Drop files or folders here</p>
            </div>
          </div>
        )}

        {currentViewMode === 'gallery' ? (
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
            onMove={(id, name, isFolder) => {
              setItemToMove({ id, name, isFolder });
            }}
            onDelete={(id, name, isFolder) => {
              setItemToDelete({ id, name, isFolder });
            }}
            onSearchResultPathClick={handleSearchResultPathClick}
            allFolders={allFolders || []}
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <FileListHeaderRow
                  allSelected={!!allSelected}
                  someSelected={someSelected}
                  onSelectAll={handleSelectAll}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  showLocationColumn={isSearchActive}
                />
                <tbody>
                  {!displayItems || displayItems.length === 0 ? (
                    <tr>
                      <td colSpan={isSearchActive ? 7 : 6} className="p-8 text-center text-muted-foreground">
                        {isSearchActive ? 'No results found' : 'No files or folders yet'}
                      </td>
                    </tr>
                  ) : (
                    displayItems.map((item) => {
                      const isFolder = item.__kind__ === 'folder';
                      const data = isFolder ? item.folder : item.file;
                      const itemId = data.id;
                      const isSelected = selectedItems.has(itemId);

                      if (isFolder) {
                        const folder = item.folder;
                        const tintClasses = getFolderTintClasses();
                        const locationPath = isSearchActive && allFolders 
                          ? getFolderContainingPath(folder.parentId, allFolders)
                          : '';

                        return (
                          <tr key={folder.id} className="border-t hover:bg-muted/50 transition-colors">
                            <td className="p-4 w-12">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
                                aria-label={`Select ${folder.name}`}
                              />
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => handleFolderClick(folder)}
                                className="flex items-center gap-2 hover:underline text-left w-full group"
                                title={folder.name}
                              >
                                <Folder className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                                <span className="truncate">{folder.name}</span>
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <Badge variant="secondary" className={tintClasses}>
                                Folder
                              </Badge>
                            </td>
                            {isSearchActive && (
                              <td className="p-4">
                                <button
                                  onClick={(e) => handleSearchResultPathClick(item, e)}
                                  className="breadcrumb-link text-sm truncate max-w-xs block"
                                  title={locationPath}
                                >
                                  {locationPath}
                                </button>
                              </td>
                            )}
                            <td className="p-4 text-center text-sm text-muted-foreground">
                              {formatCompactTimestamp(folder.createdAt)}
                            </td>
                            <td className="p-4 text-center text-sm text-muted-foreground">—</td>
                            <td className="p-4 text-center w-[160px]">
                              <div className="flex items-center justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleFolderClick(folder)}
                                      >
                                        <ChevronRight className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Open folder</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setItemToMove({ id: folder.id, name: folder.name, isFolder: true })}
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
                                        size="icon"
                                        onClick={() => setItemToDelete({ id: folder.id, name: folder.name, isFolder: true })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete folder</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </td>
                          </tr>
                        );
                      } else {
                        const file = item.file;
                        const fileType = getFileTypeLabel(file.name);
                        const category = getFileCategory(file.name);
                        const tintClasses = fileType === 'N/A' 
                          ? getUnknownTypeTintClasses()
                          : getFileTypeTintClasses(category);
                        const locationPath = isSearchActive && allFolders
                          ? getContainingFolderPath(file.parentId, allFolders)
                          : '';

                        return (
                          <tr key={file.id} className="border-t hover:bg-muted/50 transition-colors">
                            <td className="p-4 w-12">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
                                aria-label={`Select ${file.name}`}
                              />
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => handleFileClick(file)}
                                className="hover:underline text-left truncate w-full"
                                title={file.name}
                              >
                                {file.name}
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <Badge variant="secondary" className={tintClasses}>
                                {fileType}
                              </Badge>
                            </td>
                            {isSearchActive && (
                              <td className="p-4">
                                <button
                                  onClick={(e) => handleSearchResultPathClick(item, e)}
                                  className="breadcrumb-link text-sm truncate max-w-xs block"
                                  title={locationPath}
                                >
                                  {locationPath}
                                </button>
                              </td>
                            )}
                            <td className="p-4 text-center text-sm text-muted-foreground">
                              {formatCompactTimestamp(file.createdAt)}
                            </td>
                            <td className="p-4 text-center text-sm text-muted-foreground">
                              {formatFileSize(file.size)}
                            </td>
                            <td className="p-4 text-center w-[160px]">
                              <div className="flex items-center justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDownload(file)}
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
                                        size="icon"
                                        onClick={() => handleCopyLink(file)}
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
                                        size="icon"
                                        onClick={() => setItemToMove({ id: file.id, name: file.name, isFolder: false })}
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
                                        size="icon"
                                        onClick={() => setItemToDelete({ id: file.id, name: file.name, isFolder: false })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete file</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

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
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
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
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move dialog */}
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
            <Button onClick={handleMoveConfirm}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected items. This action cannot be undone.
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
            <DialogTitle>Move {selectedItems.size} items</DialogTitle>
            <DialogDescription>
              Select a destination folder for the selected items
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
            <Button onClick={handleBulkMoveConfirm}>
              Move All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File preview modal */}
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
  );
}
