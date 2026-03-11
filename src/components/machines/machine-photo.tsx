"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateMachine } from "@/actions/machine-actions";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface MachinePhotoProps {
  machineId: string;
  photoPath: string | null;
}

export function MachinePhoto({ machineId, photoPath }: MachinePhotoProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  const photoUrl = photoPath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/machine-photos/${photoPath}`
    : null;

  async function handleUpload(file: File) {
    setUploading(true);

    try {
      // Compress image client-side
      const compressed = await compressImage(file);
      const ext = "jpg";
      const filePath = `${machineId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("machine-photos")
        .upload(filePath, compressed, {
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      await updateMachine(machineId, { photo_path: filePath });

      toast.success("Photo uploaded");
      router.refresh();
    } catch (err) {
      toast.error("Failed to upload photo");
      console.error(err);
    }

    setUploading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  async function handleRemovePhoto() {
    setUploading(true);
    try {
      if (photoPath) {
        await supabase.storage.from("machine-photos").remove([photoPath]);
      }
      await updateMachine(machineId, { photo_path: null });
      toast.success("Photo removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove photo");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      {photoUrl ? (
        <div className="relative">
          <img
            src={`${photoUrl}?t=${Date.now()}`}
            alt="Machine photo"
            className="rounded-lg max-h-64 object-cover w-full"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleRemovePhoto}
            disabled={uploading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed bg-muted/50">
          <p className="text-sm text-muted-foreground">No photo uploaded</p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : "Upload"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="md:hidden"
        >
          <Camera className="mr-2 h-4 w-4" />
          Camera
        </Button>
      </div>
    </div>
  );
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      const maxHeight = 1200;
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob!),
        "image/jpeg",
        0.8
      );
    };
    img.src = objectUrl;
  });
}
