import { Download, File, FileText, Image as ImageIcon, Video as VideoIcon, Music, Archive, Link2, Trash2, MoveRight, Folder, FileCode, FileQuestion, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FileSystemItem, FolderMetadata, FileMetadata } from '../backend';
import { getFileExtension, getFileCategory, type FileCategory } from '../lib/fileTypes';
import { MoreVertical } from 'lucide-react';
import { formatCompactTimestamp } from '../lib/formatTime';

interface FileGalleryProps {
  items: FileSystemItem[];
  selectedItems: Set<string>;
  onSelectItem: (itemId: string, checked: boolean) => void;
  onFileClick: (file: FileMetadata) => void;
  onFolderClick: (folder: FolderMetadata) => void;
  onDownload: (file: FileMetadata) => void;
  onCopyLink: (file: FileMetadata) => void;
  onMove: (item: { id: string; name: string; isFolder: boolean }) => void;
  onDelete: (item: { id: string; name: string; isFolder: boolean }) => void;
}

function getCategoryIcon(category: FileCategory, className?: string) {
  switch (category) {
    case 'image':
      return <ImageIcon className={className} />;
    case 'video':
      return <VideoIcon className={className} />;
    case 'audio':
      return <Music className={className} />;
    case 'archive':
      return <Archive className={className} />;
    case 'code':
      return <FileCode className={className} />;
    case 'document':
      return <FileText className={className} />;
    case 'text':
      return <FileText className={className} />;
    default:
      return <FileQuestion className={className} />;
  }
}

export function FileGallery({
  items,
  selectedItems,
  onSelectItem,
  onFileClick,
  onFolderClick,
  onDownload,
  onCopyLink,
  onMove,
  onDelete,
}: FileGalleryProps) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
        {items.map((item) => {
          const isFolder = item.__kind__ === 'folder';
          const id = isFolder ? item.folder.id : item.file.id;
          const name = isFolder ? item.folder.name : item.file.name;
          const isSelected = selectedItems.has(id);

          if (isFolder) {
            return (
              <Card
                key={id}
                className={`relative group cursor-pointer transition-all hover:shadow-lg ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
              >
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onSelectItem(id, checked as boolean)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div
                  className="p-4 flex flex-col items-center justify-center min-h-[160px]"
                  onClick={() => onFolderClick(item.folder)}
                >
                  <Folder className="w-16 h-16 text-primary mb-2" />
                  <p className="text-sm font-medium text-center break-words w-full px-2">
                    {name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCompactTimestamp(item.folder.updatedAt)}
                  </p>
                </div>
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onMove({ id, name, isFolder: true });
                      }}>
                        <MoveRight className="mr-2 h-4 w-4" />
                        Move
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete({ id, name, isFolder: true });
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          }

          // File tile
          const file = item.file;
          const category = getFileCategory(file.name);
          const isImage = category === 'image';
          const isVideo = category === 'video';
          const directUrl = file.blob.getDirectURL();

          return (
            <Card
              key={id}
              className={`relative group cursor-pointer transition-all hover:shadow-lg ${
                isSelected ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelectItem(id, checked as boolean)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div
                className="flex flex-col min-h-[160px]"
                onClick={() => onFileClick(file)}
              >
                {/* Thumbnail/Preview area */}
                <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 min-h-[120px]">
                  {isImage ? (
                    <img
                      src={directUrl}
                      alt={name}
                      className="max-w-full max-h-[100px] object-contain"
                      loading="lazy"
                    />
                  ) : isVideo ? (
                    <video
                      src={directUrl}
                      className="max-w-full max-h-[100px] object-contain"
                      muted
                      playsInline
                    />
                  ) : (
                    getCategoryIcon(category, 'w-12 h-12 text-muted-foreground')
                  )}
                </div>
                {/* File info */}
                <div className="p-2 border-t">
                  <p className="text-xs font-medium truncate" title={name}>
                    {name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCompactTimestamp(file.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur-sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onDownload(file);
                    }}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onCopyLink(file);
                    }}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onMove({ id, name, isFolder: false });
                    }}>
                      <MoveRight className="mr-2 h-4 w-4" />
                      Move
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete({ id, name, isFolder: false });
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
