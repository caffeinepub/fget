export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    // Videos
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'odt': 'application/vnd.oasis.opendocument.text',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2',
    // Code/Text
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'md': 'text/markdown',
    'csv': 'text/csv',
  };

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

export function isPreviewable(extension: string): boolean {
  const ext = extension.toLowerCase();
  return isImage(ext) || isVideo(ext) || isAudio(ext) || isDocument(ext) || isText(ext);
}

export function isImage(extension: string): boolean {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
  return imageExts.includes(extension.toLowerCase());
}

export function isVideo(extension: string): boolean {
  const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
  return videoExts.includes(extension.toLowerCase());
}

export function isAudio(extension: string): boolean {
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
  return audioExts.includes(extension.toLowerCase());
}

export function isDocument(extension: string): boolean {
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  return docExts.includes(extension.toLowerCase());
}

export function isText(extension: string): boolean {
  const textExts = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js'];
  return textExts.includes(extension.toLowerCase());
}

/**
 * Gets a human-readable file type label from a filename
 */
export function getFileTypeLabel(filename: string): string {
  const ext = getFileExtension(filename).toUpperCase();
  
  if (!ext) return 'FILE';
  
  // Map common extensions to friendly names
  const typeLabels: Record<string, string> = {
    'JPG': 'JPEG',
    'JPEG': 'JPEG',
    'PNG': 'PNG',
    'GIF': 'GIF',
    'SVG': 'SVG',
    'WEBP': 'WEBP',
    'BMP': 'BMP',
    'MP4': 'MP4',
    'AVI': 'AVI',
    'MOV': 'MOV',
    'WEBM': 'WEBM',
    'MKV': 'MKV',
    'MP3': 'MP3',
    'WAV': 'WAV',
    'OGG': 'OGG',
    'FLAC': 'FLAC',
    'PDF': 'PDF',
    'DOC': 'DOC',
    'DOCX': 'DOCX',
    'TXT': 'TXT',
    'MD': 'Markdown',
    'JSON': 'JSON',
    'XML': 'XML',
    'HTML': 'HTML',
    'CSS': 'CSS',
    'JS': 'JavaScript',
    'ZIP': 'ZIP',
    'RAR': 'RAR',
    '7Z': '7Z',
    'XLS': 'Excel',
    'XLSX': 'Excel',
    'PPT': 'PowerPoint',
    'PPTX': 'PowerPoint',
    'CSV': 'CSV',
  };
  
  return typeLabels[ext] || ext;
}
