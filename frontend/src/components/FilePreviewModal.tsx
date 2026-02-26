import { useState, useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Loader2, AlertCircle, Maximize2, Minimize2, File, FileText, Image as ImageIcon, Video as VideoIcon, Music, Archive } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { getFileExtension, getMimeType, isImage, isVideo, isAudio, isDocument, isText } from '../lib/fileTypes';
import type { FileMetadata } from '../backend';
import { ZoomPanViewer } from './ZoomPanViewer';

interface FilePreviewModalProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  allFiles?: FileMetadata[];
  currentFileIndex?: number;
  onNavigateFile?: (index: number) => void;
}

export function FilePreviewModal({
  file,
  isOpen,
  onClose,
  allFiles = [],
  currentFileIndex = 0,
  onNavigateFile,
}: FilePreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const extension = file ? getFileExtension(file.name) : '';
  const mimeType = getMimeType(extension);
  const isImageFile = isImage(extension);
  const isVideoFile = isVideo(extension);
  const isAudioFile = isAudio(extension);
  const isDocumentFile = isDocument(extension);
  const isTextFile = isText(extension);
  const isSupported = isImageFile || isVideoFile || isAudioFile || isDocumentFile || isTextFile;

  const canNavigate = allFiles.length > 1;
  const hasPrevious = canNavigate && currentFileIndex > 0;
  const hasNext = canNavigate && currentFileIndex < allFiles.length - 1;

  useEffect(() => {
    if (!file || !isOpen) {
      setBlobUrl(null);
      setTextContent(null);
      setIsLoading(true);
      setError(null);
      return;
    }

    const loadFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if file type is supported
        if (!isSupported) {
          setError('Preview not available for this file type');
          setIsLoading(false);
          return;
        }

        // For images and videos, use direct URL for better performance
        if (isImageFile || isVideoFile || isAudioFile) {
          const directUrl = file.blob.getDirectURL();
          setBlobUrl(directUrl);
          setIsLoading(false);
        } 
        // For documents, create blob URL for iframe preview
        else if (isDocumentFile) {
          const bytes = await file.blob.getBytes();
          const blob = new Blob([bytes], { type: mimeType });
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setIsLoading(false);
        }
        // For text files, load content as text
        else if (isTextFile) {
          const bytes = await file.blob.getBytes();
          const text = new TextDecoder().decode(bytes);
          setTextContent(text);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Preview error:', err);
        setError('Failed to load preview');
        setIsLoading(false);
      }
    };

    loadFile();

    return () => {
      if (blobUrl && (isDocumentFile || isTextFile)) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [file, isOpen, extension]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Cleanup fullscreen on unmount
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const bytes = await file.blob.getBytes();
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

  const handlePrevious = () => {
    if (hasPrevious && onNavigateFile) {
      onNavigateFile(currentFileIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext && onNavigateFile) {
      onNavigateFile(currentFileIndex + 1);
    }
  };

  const toggleFullscreen = async () => {
    const viewerElement = document.getElementById('file-viewer-container');
    if (!viewerElement) return;

    try {
      if (!document.fullscreenElement) {
        await viewerElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
      toast.error('Fullscreen not supported');
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && hasPrevious) {
      handlePrevious();
    } else if (e.key === 'ArrowRight' && hasNext) {
      handleNext();
    } else if (e.key === 'Escape') {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        onClose();
      }
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, hasPrevious, hasNext]);

  const getFileIcon = (fileName: string) => {
    const ext = getFileExtension(fileName);
    if (isImage(ext)) return <ImageIcon className="h-4 w-4" />;
    if (isVideo(ext)) return <VideoIcon className="h-4 w-4" />;
    if (isAudio(ext)) return <Music className="h-4 w-4" />;
    if (isText(ext)) return <FileText className="h-4 w-4" />;
    if (ext === 'zip' || ext === 'rar' || ext === '7z') return <Archive className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (size: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let fileSize = size;
    let unitIndex = 0;

    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }

    return `${fileSize.toFixed(2)} ${units[unitIndex]}`;
  };

  if (!file) return null;

  const viewerSizeClass = isMaximized 
    ? 'w-[95vw] h-[95vh]' 
    : 'w-[90vw] max-w-6xl h-[85vh] sm:w-[85vw] sm:h-[80vh]';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div
            id="file-viewer-container"
            className={`${viewerSizeClass} bg-background rounded-lg shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b bg-background/95 backdrop-blur flex-shrink-0">
              <div className="flex-1 min-w-0 mr-2 sm:mr-4">
                <h2 className="text-sm sm:text-lg font-semibold truncate">{file.name}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {extension.toUpperCase()} • {formatFileSize(Number(file.size))}
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {canNavigate && (
                  <>
                    <Button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      size="sm"
                      variant="outline"
                      className="gap-1 sm:gap-2 h-8 sm:h-9"
                      title="Previous (←)"
                    >
                      <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline text-xs sm:text-sm">Previous</span>
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!hasNext}
                      size="sm"
                      variant="outline"
                      className="gap-1 sm:gap-2 h-8 sm:h-9"
                      title="Next (→)"
                    >
                      <span className="hidden sm:inline text-xs sm:text-sm">Next</span>
                      <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleDownload}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9"
                  title="Download (D)"
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs sm:text-sm">Download</span>
                </Button>
                <Button
                  onClick={toggleMaximize}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9 hidden sm:flex"
                  title="Maximize/Restore"
                >
                  {isMaximized ? (
                    <Minimize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
                <Button
                  onClick={toggleFullscreen}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="hidden md:inline text-xs sm:text-sm">
                    {isFullscreen ? 'Exit' : 'Fullscreen'}
                  </span>
                </Button>
                <Button
                  onClick={onClose}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Main Content Area with Sidebar */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* File List Sidebar */}
              {canNavigate && (
                <div className="w-48 sm:w-64 border-r bg-muted/30 flex-shrink-0 flex flex-col">
                  <div className="px-3 py-2 border-b bg-background/50 flex-shrink-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      Files ({allFiles.length})
                    </p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {allFiles.map((f, idx) => (
                        <button
                          key={f.id}
                          onClick={() => onNavigateFile?.(idx)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                            idx === currentFileIndex
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          }`}
                          title={f.name}
                        >
                          {getFileIcon(f.name)}
                          <span className="truncate flex-1">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Preview Content */}
              <div className="relative flex-1 flex items-center justify-center bg-muted/30 overflow-hidden min-h-0">
                {/* Navigation Arrows - Always visible when navigation is available */}
                {canNavigate && (
                  <>
                    <button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border rounded-full p-2 sm:p-3 shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Previous (←)"
                    >
                      <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!hasNext}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border rounded-full p-2 sm:p-3 shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Next (→)"
                    >
                      <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                  </>
                )}

                {isLoading && (
                  <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                    <p className="text-xs sm:text-sm text-muted-foreground">Loading preview...</p>
                  </div>
                )}

                {error && (
                  <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                    <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    <p className="text-xs sm:text-sm text-muted-foreground text-center">{error}</p>
                    <Button onClick={handleDownload} variant="outline" className="gap-2" size="sm">
                      <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      Download file
                    </Button>
                  </div>
                )}

                {!isLoading && !error && (
                  <div className="w-full h-full flex flex-col min-h-0">
                    {/* Image Preview with Zoom/Pan */}
                    {isImageFile && blobUrl && (
                      <ZoomPanViewer className="p-2 sm:p-4">
                        <img
                          src={blobUrl}
                          alt={file.name}
                          className="max-w-full max-h-full object-contain"
                          onError={() => setError('Failed to load image')}
                        />
                      </ZoomPanViewer>
                    )}

                    {/* Video Preview */}
                    {isVideoFile && blobUrl && (
                      <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-auto">
                        <video
                          src={blobUrl}
                          controls
                          className="max-w-full max-h-full"
                          onError={() => setError('Failed to load video')}
                        >
                          Your browser does not support video playback.
                        </video>
                      </div>
                    )}

                    {/* Audio Preview */}
                    {isAudioFile && blobUrl && (
                      <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 overflow-auto">
                        <audio
                          src={blobUrl}
                          controls
                          className="w-full max-w-md"
                          onError={() => setError('Failed to load audio')}
                        >
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    )}

                    {/* Document Preview */}
                    {isDocumentFile && blobUrl && (
                      <div className="w-full h-full overflow-auto">
                        <iframe
                          src={blobUrl}
                          className="w-full h-full border-0"
                          title={file.name}
                          onError={() => setError('Failed to load document')}
                        />
                      </div>
                    )}

                    {/* Text Preview */}
                    {isTextFile && textContent !== null && (
                      <ScrollArea className="w-full h-full">
                        <pre className="p-4 sm:p-6 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">
                          {textContent}
                        </pre>
                      </ScrollArea>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
