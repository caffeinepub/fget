import { Download, File, FileText, Image, Video, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp, X, FileCode, FileQuestion, LayoutList, LayoutGrid } from 'lucide-react';
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
import { copyFileLink } from '../lib/fileLinks';
import { uploadFolderRecursively, extractFolderFiles, validateFolderFiles } from '../lib/folderUpload';
import { extractDroppedFiles } from '../lib/dragDropDirectory';
import { resolvePathSegment, buildBreadcrumbPath, resolveFileParentPath, getContainingFolderPath, getFolderContainingPath } from '../lib/folderNavigation';
import { sortFileSystemItems, type SortField, type SortDirection } from '../lib/sortFileSystemItems';
import { formatCompactTimestamp } from '../lib/formatTime';
import { FileListHeaderRow } from './FileListHeaderRow';
import { generateSecure32ByteId } from '../lib/id';
import { usePerFolderViewMode, type ViewMode } from '../hooks/usePerFolderViewMode';

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
        // Upload as individual files - filter out empty files
        const nonEmptyFiles: typeof droppedFiles = [];
        const emptyFiles: string[] = [];
        
        for (const droppedFile of droppedFiles) {
          if (droppedFile.file.size === 0) {
            emptyFiles.push(droppedFile.file.name);
          } else {
            nonEmptyFiles.push(droppedFile);
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
          return;
        }

        setUploadingFiles(nonEmptyFiles.map(f => f.file.name));

        for (const droppedFile of nonEmptyFiles) {
          const arrayBuffer = await droppedFile.file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setUploadProgress(percentage);
          });

          await addFile.mutateAsync({
            id: generateSecure32ByteId(),
            name: droppedFile.file.name,
            size: BigInt(droppedFile.file.size),
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

  const getFileIcon = (category: FileCategory) => {
    switch (category) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Music className="h-4 w-4" />;
      case 'archive':
        return <Archive className="h-4 w-4" />;
      case 'code':
        return <FileCode className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'text':
        return <FileText className="h-4 w-4" />;
      default:
        return <FileQuestion className="h-4 w-4" />;
    }
  };

  const handleDownload = (file: FileMetadata) => {
    const url = file.blob.getDirectURL();
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    toast.success('Download started');
  };

  const renderFileRow = (item: FileSystemItem) => {
    const isFolder = item.__kind__ === 'folder';
    const data = isFolder ? item.folder : item.file;
    const itemId = data.id;
    const isSelected = selectedItems.has(itemId);

    if (isFolder) {
      const folder = item.folder;
      return (
        <div
          key={folder.id}
          className="grid items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40"
          style={{
            gridTemplateColumns: '40px 1fr 60px 180px 120px 200px',
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
            aria-label={`Select ${folder.name}`}
          />
          
          <button
            onClick={() => handleFolderClick(folder)}
            className="flex items-center gap-3 text-left hover:text-primary transition-colors min-w-0"
          >
            <Folder className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="font-medium truncate">{folder.name}</span>
          </button>

          <div className="flex items-center justify-center">
            <Folder className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="text-sm text-muted-foreground">
            {formatCompactTimestamp(folder.createdAt)}
          </div>

          <div className="text-sm text-muted-foreground">—</div>

          <div className="flex items-center justify-end gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItemToMove({ id: folder.id, name: folder.name, isFolder: true })}
                    className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
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
      const fileCategory = getFileCategory(file.name);
      const fileTypeLabel = getFileTypeLabel(file.name);

      return (
        <div
          key={file.id}
          className="grid items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40"
          style={{
            gridTemplateColumns: '40px 1fr 60px 180px 120px 200px',
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
            aria-label={`Select ${file.name}`}
          />

          <button
            onClick={() => handleFileClick(file)}
            className="flex items-center gap-3 text-left hover:text-primary transition-colors min-w-0"
          >
            {getFileIcon(fileCategory)}
            <span className="truncate">{file.name}</span>
          </button>

          <div className="flex items-center justify-center">
            {getFileIcon(fileCategory)}
          </div>

          <div className="text-sm text-muted-foreground">
            {formatCompactTimestamp(file.createdAt)}
          </div>

          <div className="text-sm text-muted-foreground">
            {(Number(file.size) / 1024).toFixed(2)} KB
          </div>

          <div className="flex items-center justify-end gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(file)}
                    className="h-8 w-8"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download file</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyFileLink(file)}
                    className="h-8 w-8"
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
                    className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
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
  };

  const renderSearchResultRow = (item: FileSystemItem) => {
    const isFolder = item.__kind__ === 'folder';
    const data = isFolder ? item.folder : item.file;
    const itemId = data.id;
    const isSelected = selectedItems.has(itemId);

    // Get containing folder path for display
    const containingPath = allFolders 
      ? (isFolder 
          ? getFolderContainingPath(item.folder, allFolders)
          : getContainingFolderPath(item.file, allFolders))
      : 'Drive';

    if (isFolder) {
      const folder = item.folder;
      return (
        <div
          key={folder.id}
          className="grid items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40"
          style={{
            gridTemplateColumns: '40px 1fr 60px 180px 120px 200px',
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
            aria-label={`Select ${folder.name}`}
          />
          
          <div className="flex flex-col gap-1 min-w-0">
            <button
              onClick={() => handleFolderClick(folder)}
              className="flex items-center gap-3 text-left hover:text-primary transition-colors min-w-0"
            >
              <Folder className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="font-medium truncate">{folder.name}</span>
            </button>
            <button
              onClick={(e) => handleSearchResultPathClick(item, e)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate text-left pl-8"
            >
              in {containingPath}
            </button>
          </div>

          <div className="flex items-center justify-center">
            <Folder className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="text-sm text-muted-foreground">
            {formatCompactTimestamp(folder.createdAt)}
          </div>

          <div className="text-sm text-muted-foreground">—</div>

          <div className="flex items-center justify-end gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItemToMove({ id: folder.id, name: folder.name, isFolder: true })}
                    className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
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
      const fileCategory = getFileCategory(file.name);
      const fileTypeLabel = getFileTypeLabel(file.name);

      return (
        <div
          key={file.id}
          className="grid items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40"
          style={{
            gridTemplateColumns: '40px 1fr 60px 180px 120px 200px',
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleSelectItem(itemId, checked as boolean)}
            aria-label={`Select ${file.name}`}
          />

          <div className="flex flex-col gap-1 min-w-0">
            <button
              onClick={() => handleFileClick(file)}
              className="flex items-center gap-3 text-left hover:text-primary transition-colors min-w-0"
            >
              {getFileIcon(fileCategory)}
              <span className="truncate">{file.name}</span>
            </button>
            <button
              onClick={(e) => handleSearchResultPathClick(item, e)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors truncate text-left pl-8"
            >
              in {containingPath}
            </button>
          </div>

          <div className="flex items-center justify-center">
            {getFileIcon(fileCategory)}
          </div>

          <div className="text-sm text-muted-foreground">
            {formatCompactTimestamp(file.createdAt)}
          </div>

          <div className="text-sm text-muted-foreground">
            {(Number(file.size) / 1024).toFixed(2)} KB
          </div>

          <div className="flex items-center justify-end gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(file)}
                    className="h-8 w-8"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download file</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyFileLink(file)}
                    className="h-8 w-8"
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
                    className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
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
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading files: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader className="space-y-4">
          {/* Breadcrumb and View Toggle Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {folderPath.map((segment, index) => (
                <div key={segment.id || 'root'} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className="text-sm font-medium hover:text-primary transition-colors"
                  >
                    {segment.name}
                  </button>
                </div>
              ))}
            </div>

            {/* View mode toggle */}
            {!isSearchActive && (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={currentViewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode(currentFolderId, 'list')}
                  className="h-8 w-8"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant={currentViewMode === 'gallery' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode(currentFolderId, 'gallery')}
                  className="h-8 w-8"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Search and Action Buttons Row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Action buttons - labeled, no tooltips, ordered: Upload Files → Upload Folder → Create Folder */}
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles.length > 0}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>

            <Button
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={uploadingFiles.length > 0}
            >
              <FolderUp className="h-4 w-4 mr-2" />
              Upload Folder
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowCreateFolder(true)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Create Folder
            </Button>

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
              webkitdirectory="true"
              directory="true"
              onChange={handleFolderUpload}
              className="hidden"
            />
          </div>

          {/* Multi-select toolbar */}
          {selectedItems.size > 0 && (
            <div className="flex items-center justify-between gap-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                >
                  Clear
                </Button>
              </div>
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
              </div>
            </div>
          )}

          {/* Upload progress */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Uploading {uploadingFiles.length} file{uploadingFiles.length !== 1 ? 's' : ''}...
                </span>
                <span className="font-medium">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </CardHeader>

        <CardContent
          className="flex-1 overflow-auto"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
                <p className="text-lg font-medium">Drop files or folders here</p>
              </div>
            </div>
          )}

          {isLoading || searchLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : displayItems && displayItems.length > 0 ? (
            currentViewMode === 'gallery' && !isSearchActive ? (
              <FileGallery
                items={displayItems}
                selectedItems={selectedItems}
                onSelectItem={handleSelectItem}
                onFileClick={handleFileClick}
                onFolderClick={handleFolderClick}
                onDownload={handleDownload}
                onCopyLink={copyFileLink}
                onMove={(item) => setItemToMove(item)}
                onDelete={(item) => setItemToDelete(item)}
              />
            ) : (
              <div className="space-y-0">
                <FileListHeaderRow
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={(field) => {
                    if (sortField === field) {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField(field);
                      setSortDirection('asc');
                    }
                  }}
                  hasSelection={selectedItems.size > 0}
                  allSelected={allSelected}
                  onSelectAll={handleSelectAll}
                />
                {displayItems.map((item) => 
                  isSearchActive ? renderSearchResultRow(item) : renderFileRow(item)
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              {isSearchActive ? (
                <>
                  <Search className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">No results found</p>
                  <p className="text-sm">Try a different search term</p>
                </>
              ) : (
                <>
                  <Folder className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">This folder is empty</p>
                  <p className="text-sm">Upload files or create a new folder to get started</p>
                </>
              )}
            </div>
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
