import { initUploads, markAssetUploaded, resignUpload } from "@/lib/api/orblodeSvc";
import type { UploadApi } from "@/lib/upload/pipeline";
import { putToSignedUrl } from "@/lib/upload/putToSignedUrl";

export const uploadApi: UploadApi = { initUploads, resignUpload, putToSignedUrl, markAssetUploaded };
