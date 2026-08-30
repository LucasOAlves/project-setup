import { ERROR_CODES } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../app-error.js";
import type { ProfileService } from "./profile-service.js";

export async function registerProfileRoutes(
  app: FastifyInstance,
  service: ProfileService,
): Promise<void> {
  app.get("/api/profile", async (_request, reply) => {
    const profile = await service.getProfile();
    if (!profile) {
      return reply.code(200).send({ profile: null });
    }
    return { profile };
  });

  app.put("/api/profile", async (request, reply) => {
    const profile = await service.saveProfile(request.body);
    return reply.code(200).send({ profile });
  });

  app.post("/api/profile/experiences", async (request, reply) => {
    const profile = await service.addExperience(request.body);
    return reply.code(201).send({ profile });
  });

  app.post("/api/profile/photos", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new AppError(ERROR_CODES.VALIDATION, "A photo file is required.", 400);
    }
    const bytes = await file.toBuffer();
    const profile = await service.uploadPhoto({
      bytes,
      filename: file.filename,
      claimedType: file.mimetype,
    });
    return reply.code(201).send({ profile });
  });

  app.get("/api/profile/photos/:photoId", async (request, reply) => {
    const { photoId } = request.params as { photoId: string };
    const object = await service.getPhotoFile(photoId);
    return reply
      .header("Content-Type", object.mimeType)
      .header("Cache-Control", "private, max-age=3600")
      .send(object.bytes);
  });

  app.delete("/api/profile/photos/:photoId", async (request) => {
    const { photoId } = request.params as { photoId: string };
    const profile = await service.removePhoto(photoId);
    return { profile };
  });
}
