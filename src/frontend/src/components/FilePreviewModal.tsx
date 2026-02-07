import { useState, useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Loader2, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getFileExtension, getMimeType, isImage, isVideo, isAudio, isDocument, isText } from '../lib/fileTypes';
import type { FileMetadata } from '../backend';

interface FilePreviewModalProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  allImages?: FileMetadata[];
  currentImageIndex?: number;
  onNavigate?: (index: number) => void;
}

export function FilePreviewModal({
  file,
  isOpen,
  onClose,
  allImages = [],
  currentImageIndex = 0,
  onNavigate,
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

  const canNavigate = isImageFile && allImages.length > 1;
  const hasPrevious = canNavigate && currentImageIndex > 0;
  const hasNext = canNavigate && currentImageIndex < allImages.length - 1;

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
    if (hasPrevious && onNavigate) {
      onNavigate(currentImageIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext && onNavigate) {
      onNavigate(currentImageIndex + 1);
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

  if (!file) return null;

  const viewerSizeClass = isMaximized 
    ? 'w-[95vw] h-[95vh]' 
    : 'w-[90vw] max-w-5xl h-[85vh] sm:w-[85vw] sm:h-[80vh]';

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

            {/* Content */}
            <div className="relative flex-1 flex items-center justify-center bg-muted/30 overflow-hidden">
              {isLoading && (
                <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                  <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Loading preview...</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                  <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">{error}</p>
                  <Button onClick={handleDownload} variant="outline" className="gap-2" size="sm">
                    <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                    Download file instead
                  </Button>
                </div>
              )}

              {!isLoading && !error && (
                <div className="w-full h-full overflow-auto">
                  {/* Image Preview */}
                  {isImageFile && blobUrl && (
                    <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4">
                      <img
                        src={blobUrl}
                        alt={file.name}
                        className="max-w-full max-h-full object-contain"
                        onError={() => setError('Failed to load image')}
                      />
                    </div>
                  )}

                  {/* Video Preview */}
                  {isVideoFile && blobUrl && (
                    <div className="w-full h-full flex items-center justify-center p-2 sm:p-4">
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
                    <div className="w-full h-full flex items-center justify-center p-4 sm:p-8">
                      <audio
                        src={blobUrl}
                        controls
                        className="w-full max-w-2xl"
                        onError={() => setError('Failed to load audio')}
                      >
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  )}

                  {/* Document Preview */}
                  {isDocumentFile && blobUrl && (
                    <div className="w-full h-full">
                      <iframe
                        src={blobUrl}
                        className="w-full h-full border-0"
                        title={file.name}
                        onError={() => {
                          setError('Document preview not supported in your browser');
                        }}
                      />
                    </div>
                  )}

                  {/* Text Preview */}
                  {isTextFile && textContent !== null && (
                    <div className="w-full h-full overflow-auto p-3 sm:p-6">
                      <pre className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words bg-background/50 p-3 sm:p-4 rounded-lg border">
                        {textContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Arrows for Images */}
              {canNavigate && !isLoading && !error && (
                <>
                  {hasPrevious && (
                    <Button
                      onClick={handlePrevious}
                      size="icon"
                      variant="secondary"
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-lg"
                      title="Previous (←)"
                    >
                      <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                    </Button>
                  )}
                  {hasNext && (
                    <Button
                      onClick={handleNext}
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-lg"
                      title="Next (→)"
                    >
                      <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Footer with navigation info */}
            {canNavigate && (
              <div className="flex items-center justify-center px-3 py-2 sm:px-4 sm:py-3 border-t bg-background/95 backdrop-blur flex-shrink-0">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Image {currentImageIndex + 1} of {allImages.length}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
