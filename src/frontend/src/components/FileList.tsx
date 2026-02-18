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
    setCurrentFolderId(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    setSearchTerm('');
    setSelectedItems(new Set());
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
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
      
      setCurrentFolderId(targetFolderId);
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
    copyFileLink(file);
  };

  const renderFileIcon = (category: FileCategory) => {
    switch (category) {
      case 'image':
        return <FileImage className="h-4 w-4" />;
      case 'video':
        return <FileVideo className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" />;
      case 'archive':
        return <FileArchive className="h-4 w-4" />;
      case 'code':
        return <FileCode className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'text':
        return <FileType className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const renderListView = () => {
    if (isLoading || searchLoading) {
      return (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8 text-destructive">
          Error loading files: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      );
    }

    if (!displayItems || displayItems.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {isSearchActive ? 'No results found' : 'No files or folders yet'}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <FileListHeaderRow
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          allSelected={allSelected}
          onSelectAll={handleSelectAll}
          hasSelection={displayItems.length > 0}
        />
        {displayItems.map((item) => {
          const isFolder = item.__kind__ === 'folder';
          const data = isFolder ? item.folder : item.file;
          const itemId = data.id;
          const isSelected = selectedItems.has(itemId);
          const category = isFolder ? null : getFileCategory(data.name);
          const typeLabel = isFolder ? 'Folder' : getFileTypeLabel(data.name);
          const ext = isFolder ? '' : getFileExtension(data.name);
          const tintClasses = isFolder 
            ? getFolderTintClasses() 
            : (typeLabel === 'N/A' ? getUnknownTypeTintClasses() : getFileTypeTintClasses(category!));

          return (
            <div
              key={itemId}
              className={`grid grid-cols-[40px_1fr_120px_140px_140px_160px] gap-4 items-center px-4 py-2.5 rounded-lg hover:bg-muted/50 transition-colors ${
                isSelected ? 'bg-muted/70' : ''
              }`}
            >
              {/* Selection checkbox */}
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
                />
              </div>

              {/* Name with icon */}
              <div className="flex items-center gap-3 min-w-0">
                {isFolder ? (
                  <Folder className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                ) : (
                  <div className="flex-shrink-0 text-muted-foreground">
                    {renderFileIcon(category!)}
                  </div>
                )}
                <button
                  onClick={() => {
                    if (isFolder) {
                      handleFolderClick(data as FolderMetadata);
                    } else {
                      handleFileClick(data as FileMetadata);
                    }
                  }}
                  className="text-left hover:text-primary transition-colors truncate font-medium"
                  title={data.name}
                >
                  {data.name}
                </button>
              </div>

              {/* Type badge */}
              <div className="flex items-center justify-center">
                <Badge variant="outline" className={`text-xs font-medium ${tintClasses}`}>
                  {typeLabel}
                </Badge>
              </div>

              {/* Size */}
              <div className="text-sm text-muted-foreground text-center">
                {isFolder ? '—' : formatFileSize((data as FileMetadata).size)}
              </div>

              {/* Updated */}
              <div className="text-sm text-muted-foreground text-center">
                {formatCompactTimestamp(data.updatedAt)}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <TooltipProvider>
                  {!isFolder && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(data as FileMetadata)}
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
                            className="h-8 w-8"
                            onClick={() => handleCopyLink(data as FileMetadata)}
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
                        onClick={() => {
                          setItemToMove({ id: itemId, name: data.name, isFolder });
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
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setItemToDelete({ id: itemId, name: data.name, isFolder })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            {/* Breadcrumb navigation */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {folderPath.map((segment, index) => (
                <div key={segment.id || 'root'} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className="breadcrumb-link font-medium"
                  >
                    {segment.name}
                  </button>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              {/* Search */}
              <div className="relative w-full sm:w-80">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={handleClearSearch}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* View mode toggle */}
                <div className="flex items-center gap-1 border rounded-lg p-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={currentViewMode === 'list' ? 'secondary' : 'ghost'}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewMode(currentFolderId, 'list')}
                        >
                          <LayoutList className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>List view</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={currentViewMode === 'gallery' ? 'secondary' : 'ghost'}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewMode(currentFolderId, 'gallery')}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Gallery view</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {selectedItems.size > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBulkMove(true)}
                    >
                      <MoveRight className="h-4 w-4 mr-2" />
                      Move ({selectedItems.size})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBulkDelete(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete ({selectedItems.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  </>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateFolder(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </Button>

                <input
                  ref={folderInputRef}
                  type="file"
                  /* @ts-ignore */
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleFolderUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderUp className="h-4 w-4 mr-2" />
                  Upload Folder
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            </div>

            {/* Search results info */}
            {isSearchActive && displayItems && (
              <div className="text-sm text-muted-foreground">
                Found {displayItems.length} result{displayItems.length !== 1 ? 's' : ''} for "{searchTerm}"
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`min-h-[400px] relative ${isDragging ? 'bg-muted/50 border-2 border-dashed border-primary' : ''}`}
        >
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 pointer-events-none">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
                <p className="text-lg font-medium">Drop files or folders here</p>
              </div>
            </div>
          )}

          {uploadingFiles.length > 0 && (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Uploading {uploadingFiles.length} file{uploadingFiles.length !== 1 ? 's' : ''}...
                </span>
                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <div className="text-xs text-muted-foreground space-y-1">
                {uploadingFiles.slice(0, 3).map((name, i) => (
                  <div key={i} className="truncate">{name}</div>
                ))}
                {uploadingFiles.length > 3 && (
                  <div>...and {uploadingFiles.length - 3} more</div>
                )}
              </div>
            </div>
          )}

          {currentViewMode === 'list' ? (
            renderListView()
          ) : (
            <FileGallery
              items={displayItems || []}
              isLoading={isLoading || searchLoading}
              error={error}
              isSearchActive={isSearchActive}
              onFolderClick={handleFolderClick}
              onFileClick={handleFileClick}
              onDownload={handleDownload}
              onCopyLink={handleCopyLink}
              onMove={(id, name, isFolder) => {
                setItemToMove({ id, name, isFolder });
                setMoveDestination(null);
              }}
              onDelete={(id, name, isFolder) => setItemToDelete({ id, name, isFolder })}
              selectedItems={selectedItems}
              onSelectItem={handleSelectItem}
              onSearchResultPathClick={handleSearchResultPathClick}
              allFolders={allFolders || []}
            />
          )}
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected items and cannot be undone.
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Item Dialog */}
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

      {/* Bulk Move Dialog */}
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
            <Button onClick={handleBulkMoveConfirm} disabled={moveItems.isPending}>
              {moveItems.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
  );
}
