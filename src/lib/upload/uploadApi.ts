import { initUploads, markAssetUploaded, removeSurveyAsset } from "@/lib/api/orblodeSvc";
import type { UploadApi } from "@/lib/upload/pipeline";
import { putToSignedUrl } from "@/lib/upload/putToSignedUrl";

export const uploadApi: UploadApi = { initUploads, putToSignedUrl, markAssetUploaded, removeAsset: removeSurveyAsset };
