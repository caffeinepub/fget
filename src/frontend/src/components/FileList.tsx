import { Download, File, FileText, Image, Video, Music, Archive, Link2, Check, Loader2, Trash2, Search, Folder, FolderPlus, MoveRight, ChevronRight, Upload, FolderUp, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { getFileExtension, getMimeType, isPreviewable, isImage } from '../lib/fileTypes';
import { normalizeSearchTerm } from '../lib/search';

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
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  const { data: items, isLoading, error } = useGetFolderContents(currentFolderId);
  
  // Normalize search term for consistent matching
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
  const isSearching = normalizedSearchTerm.length > 0;
  
  const { data: searchResults, isLoading: searchLoading } = useSearchSubtree(searchTerm, currentFolderId);
  const { data: allFolders } = useGetAllFolders();
  const createFolder = useCreateFolder();
  const addFile = useAddFile();

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

  const folders = useMemo(() => {
    return items?.filter((item): item is { __kind__: 'folder'; folder: FolderMetadata } => 
      item.__kind__ === 'folder'
    ).map(item => item.folder) || [];
  }, [items]);

  const files = useMemo(() => {
    return items?.filter((item): item is { __kind__: 'file'; file: FileMetadata } => 
      item.__kind__ === 'file'
    ).map(item => item.file) || [];
  }, [items]);

  // Get all previewable files in current folder for modal navigation
  const previewableFiles = useMemo(() => {
    return files.filter(file => isPreviewable(getFileExtension(file.name)));
  }, [files]);

  const handleNavigateToFolder = useCallback((folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    
    if (folderId === null) {
      setFolderPath([{ id: null, name: 'Drive' }]);
    } else {
      const folder = allFolders?.find(f => f.id === folderId);
      if (folder) {
        const path: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Drive' }];
        
        const buildPath = (f: FolderMetadata) => {
          if (f.parentId) {
            const parent = allFolders?.find(pf => pf.id === f.parentId);
            if (parent) {
              buildPath(parent);
            }
          }
          path.push({ id: f.id, name: f.name });
        };
        
        buildPath(folder);
        setFolderPath(path);
      }
    }
    
    setSearchTerm('');
  }, [allFolders]);

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
      
      toast.success('Folder created', {
        description: `Created folder "${newFolderName}"`
      });
      
      setNewFolderName('');
      setShowCreateFolder(false);
    } catch (error) {
      console.error('Create folder error:', error);
      toast.error('Failed to create folder', {
        description: 'Please try again'
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.isFolder) {
        await deleteFolder.mutateAsync(itemToDelete.id);
        toast.success('Folder deleted', {
          description: `Deleted folder "${itemToDelete.name}"`
        });
      } else {
        await deleteFile.mutateAsync(itemToDelete.id);
        toast.success('File deleted', {
          description: `Deleted file "${itemToDelete.name}"`
        });
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage = error?.message || 'Unknown error';
      
      if (errorMessage.includes('not empty')) {
        toast.error('Cannot delete folder', {
          description: 'Folder must be empty before deletion'
        });
      } else {
        toast.error('Delete failed', {
          description: 'Please try again'
        });
      }
    } finally {
      setItemToDelete(null);
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
      
      toast.success('Item moved', {
        description: `Moved "${itemToMove.name}"`
      });
    } catch (error) {
      console.error('Move error:', error);
      toast.error('Move failed', {
        description: 'Please try again'
      });
    } finally {
      setItemToMove(null);
      setMoveDestination(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    await uploadFiles(Array.from(selectedFiles));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    await uploadFiles(Array.from(selectedFiles));
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const uploadFiles = async (filesToUpload: globalThis.File[]) => {
    const fileNames = filesToUpload.map(f => f.name);
    setUploadingFiles(fileNames);
    setUploadProgress(0);

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        const externalBlob = ExternalBlob.fromBytes(bytes).withUploadProgress((percentage) => {
          const overallProgress = ((i / filesToUpload.length) * 100) + (percentage / filesToUpload.length);
          setUploadProgress(Math.round(overallProgress));
        });

        await addFile.mutateAsync({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: BigInt(file.size),
          parentId: currentFolderId,
          blob: externalBlob,
        });
      }

      toast.success('Upload complete', {
        description: `Uploaded ${filesToUpload.length} file${filesToUpload.length > 1 ? 's' : ''}`
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed', {
        description: 'Please try again'
      });
    } finally {
      setUploadingFiles([]);
      setUploadProgress(0);
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

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await uploadFiles(droppedFiles);
    }
  };

  const handleDownload = async (file: FileMetadata) => {
    try {
      const bytes = await file.blob.getBytes();
      const extension = getFileExtension(file.name);
      const mimeType = getMimeType(extension);
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

  const handleCopyLink = async (file: FileMetadata) => {
    try {
      const directUrl = file.blob.getDirectURL();
      await navigator.clipboard.writeText(directUrl);
      setCopiedFileId(file.id);
      toast.success('Link copied', {
        description: 'Direct file URL copied to clipboard'
      });
      setTimeout(() => setCopiedFileId(null), 2000);
    } catch (error) {
      console.error('Copy link error:', error);
      toast.error('Failed to copy link', {
        description: 'Please try again'
      });
    }
  };

  const handlePreview = (file: FileMetadata) => {
    const extension = getFileExtension(file.name);
    if (!isPreviewable(extension)) {
      toast.error('Preview not available', {
        description: 'This file type cannot be previewed'
      });
      return;
    }

    const fileIndex = previewableFiles.findIndex(f => f.id === file.id);
    setCurrentFileIndex(fileIndex >= 0 ? fileIndex : 0);
    setPreviewFile(file);
    setShowPreview(true);
  };

  const handleNavigatePreview = (index: number) => {
    if (index >= 0 && index < previewableFiles.length) {
      setCurrentFileIndex(index);
      setPreviewFile(previewableFiles[index]);
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = getFileExtension(fileName);
    
    if (isImage(extension)) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    
    if (extension === 'mp4' || extension === 'webm' || extension === 'mov' || extension === 'avi') {
      return <Video className="h-5 w-5 text-purple-500" />;
    }
    
    if (extension === 'mp3' || extension === 'wav' || extension === 'ogg' || extension === 'flac') {
      return <Music className="h-5 w-5 text-green-500" />;
    }
    
    if (extension === 'txt' || extension === 'md' || extension === 'json' || extension === 'xml' || 
        extension === 'csv' || extension === 'log' || extension === 'js' || extension === 'ts' || 
        extension === 'jsx' || extension === 'tsx' || extension === 'html' || extension === 'css' ||
        extension === 'py' || extension === 'java' || extension === 'c' || extension === 'cpp' ||
        extension === 'rs' || extension === 'go' || extension === 'rb' || extension === 'php') {
      return <FileText className="h-5 w-5 text-orange-500" />;
    }
    
    if (extension === 'zip' || extension === 'rar' || extension === '7z' || extension === 'tar' || extension === 'gz') {
      return <Archive className="h-5 w-5 text-yellow-500" />;
    }
    
    if (extension === 'pdf' || extension === 'doc' || extension === 'docx' || extension === 'xls' || 
        extension === 'xlsx' || extension === 'ppt' || extension === 'pptx') {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: bigint): string => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const availableFolders = useMemo(() => {
    if (!itemToMove) return [];
    
    return [
      { id: null, name: 'Drive' },
      ...folders.filter(f => f.id !== itemToMove.id)
    ];
  }, [folders, itemToMove]);

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Files</CardTitle>
          <CardDescription>
            Failed to load files. Please try refreshing the page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Use search results when searching, otherwise use folder contents
  const displayItems = isSearching ? searchResults : items;
  const displayFolders = isSearching
    ? searchResults?.filter((item): item is { __kind__: 'folder'; folder: FolderMetadata } => 
        item.__kind__ === 'folder'
      ).map(item => item.folder) || []
    : folders;
  const displayFiles = isSearching
    ? searchResults?.filter((item): item is { __kind__: 'file'; file: FileMetadata } => 
        item.__kind__ === 'file'
      ).map(item => item.file) || []
    : files;

  return (
    <>
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl">File Manager</CardTitle>
              <CardDescription className="mt-1">
                Upload, organize, and manage your files
              </CardDescription>
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
                onClick={() => folderInputRef.current?.click()}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <FolderUp className="h-4 w-4" />
                Upload Folder
              </Button>
              <Button
                onClick={() => setShowCreateFolder(true)}
                size="sm"
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            onChange={handleFolderSelect}
            className="hidden"
          />

          {/* Custom Breadcrumb Navigation (non-ol) */}
          <div className="flex items-center gap-1 text-sm mt-4 flex-wrap">
            {folderPath.map((pathItem, index) => (
              <div key={pathItem.id || 'root'} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                {index === folderPath.length - 1 ? (
                  <span className="font-medium text-foreground px-2 py-1">
                    {pathItem.name}
                  </span>
                ) : (
                  <button
                    onClick={() => handleNavigateToFolder(pathItem.id, pathItem.name)}
                    className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                  >
                    {pathItem.name}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {uploadingFiles.length > 0 && (
            <div className="mb-6 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Uploading {uploadingFiles.length} file(s)...</span>
                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <div className="mt-2 space-y-1">
                {uploadingFiles.map((fileName, index) => (
                  <div key={index} className="text-xs text-muted-foreground truncate">
                    {fileName}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`min-h-[400px] rounded-lg border-2 border-dashed transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted'
            }`}
          >
            {isLoading || searchLoading ? (
              <div className="p-8 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayItems && displayItems.length > 0 ? (
              <div className="p-4">
                {isSearching && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Search className="h-4 w-4" />
                    <span>
                      Found {displayItems.length} result{displayItems.length !== 1 ? 's' : ''} for "{searchTerm}"
                    </span>
                  </div>
                )}

                {displayFolders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      Folders
                    </h3>
                    <div className="grid gap-2">
                      {displayFolders.map((folder) => {
                        const fullPath = folderPathMap.get(folder.id);
                        return (
                          <div
                            key={folder.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                          >
                            <button
                              onClick={() => handleNavigateToFolder(folder.id, folder.name)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{folder.name}</div>
                                {isSearching && fullPath && (
                                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                                    {fullPath}
                                  </div>
                                )}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToMove({ id: folder.id, name: folder.name, isFolder: true })}
                                className="h-8 w-8 p-0"
                              >
                                <MoveRight className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToDelete({ id: folder.id, name: folder.name, isFolder: true })}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {displayFiles.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <File className="h-4 w-4" />
                      Files
                    </h3>
                    <div className="grid gap-2">
                      {displayFiles.map((file) => {
                        const extension = getFileExtension(file.name);
                        const canPreview = isPreviewable(extension);
                        const parentFolder = file.parentId ? allFolders?.find(f => f.id === file.parentId) : null;
                        const fullPath = parentFolder ? folderPathMap.get(parentFolder.id) : null;
                        
                        return (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {getFileIcon(file.name)}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{file.name}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                                  <span>{formatFileSize(file.size)}</span>
                                  {isSearching && fullPath && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{fullPath}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canPreview && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePreview(file)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(file)}
                                className="h-8 w-8 p-0"
                              >
                                {copiedFileId === file.id ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Link2 className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(file)}
                                className="h-8 w-8 p-0"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToMove({ id: file.id, name: file.name, isFolder: false })}
                                className="h-8 w-8 p-0"
                              >
                                <MoveRight className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToDelete({ id: file.id, name: file.name, isFolder: false })}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-center p-8">
                {isSearching ? (
                  <>
                    <Search className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No results found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      No files or folders match "{searchTerm}". Try a different search term.
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No files yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-4">
                      Drag and drop files here, or use the upload buttons above to get started
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
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
            <AlertDialogTitle>
              Delete {itemToDelete?.isFolder ? 'Folder' : 'File'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
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
              {availableFolders.map((folder) => (
                <SelectItem key={folder.id || 'root'} value={folder.id || 'root'}>
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
          onNavigateFile={handleNavigatePreview}
        />
      )}
    </>
  );
}
