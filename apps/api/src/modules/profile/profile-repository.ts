import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ProfileInput } from "@studio/shared";
import type { Database } from "../../db/client.js";
import {
  professionalExperiences,
  profiles,
  uploadedPhotos,
  writingSamples,
} from "../../db/schema.js";

export const WORKSPACE_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

export class ProfileRepository {
  constructor(private readonly db: Database) {}

  async getWorkspaceProfile() {
    const [profile] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, WORKSPACE_PROFILE_ID))
      .limit(1);

    if (!profile) {
      return null;
    }

    const experiences = await this.db
      .select()
      .from(professionalExperiences)
      .where(eq(professionalExperiences.profileId, profile.id));

    const samples = await this.db
      .select()
      .from(writingSamples)
      .where(eq(writingSamples.profileId, profile.id));

    const photos = await this.db
      .select()
      .from(uploadedPhotos)
      .where(eq(uploadedPhotos.profileId, profile.id));

    return { profile, experiences, samples, photos };
  }

  async upsertProfile(input: ProfileInput) {
    const now = new Date();

    await this.db
      .insert(profiles)
      .values({
        id: WORKSPACE_PROFILE_ID,
        fullName: input.fullName,
        headline: input.headline,
        currentJobTitle: input.currentJobTitle,
        currentCompany: input.currentCompany,
        about: input.about,
        topSkills: input.topSkills,
        technologies: input.technologies,
        industries: input.industries,
        yearsOfExperience: input.yearsOfExperience,
        architectureExperience: input.architectureExperience,
        leadershipExperience: input.leadershipExperience,
        businessImpact: input.businessImpact,
        subjectsOfInterest: input.subjectsOfInterest,
        subjectsToAvoid: input.subjectsToAvoid,
        targetAudience: input.targetAudience,
        preferredLanguage: input.preferredLanguage,
        positioning: input.positioning,
        desiredPerception: input.desiredPerception,
        writingTones: input.writingTones,
        postLength: input.postLength,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          fullName: input.fullName,
          headline: input.headline,
          currentJobTitle: input.currentJobTitle,
          currentCompany: input.currentCompany,
          about: input.about,
          topSkills: input.topSkills,
          technologies: input.technologies,
          industries: input.industries,
          yearsOfExperience: input.yearsOfExperience,
          architectureExperience: input.architectureExperience,
          leadershipExperience: input.leadershipExperience,
          businessImpact: input.businessImpact,
          subjectsOfInterest: input.subjectsOfInterest,
          subjectsToAvoid: input.subjectsToAvoid,
          targetAudience: input.targetAudience,
          preferredLanguage: input.preferredLanguage,
          positioning: input.positioning,
          desiredPerception: input.desiredPerception,
          writingTones: input.writingTones,
          postLength: input.postLength,
          updatedAt: now,
        },
      });

    await this.db
      .delete(professionalExperiences)
      .where(eq(professionalExperiences.profileId, WORKSPACE_PROFILE_ID));
    await this.db
      .delete(writingSamples)
      .where(eq(writingSamples.profileId, WORKSPACE_PROFILE_ID));

    if (input.experiences.length > 0) {
      await this.db.insert(professionalExperiences).values(
        input.experiences.map((experience, index) => ({
          id: experience.id ?? randomUUID(),
          profileId: WORKSPACE_PROFILE_ID,
          role: experience.role,
          company: experience.company,
          startPeriod: experience.startPeriod,
          endPeriod: experience.endPeriod,
          description: experience.description,
          responsibilities: experience.responsibilities,
          achievements: experience.achievements,
          technologies: experience.technologies,
          measurableOutcomes: experience.measurableOutcomes,
          sortOrder: index,
        })),
      );
    }

    const samples = input.writingSamples.filter((sample) => sample.body.trim());
    if (samples.length > 0) {
      await this.db.insert(writingSamples).values(
        samples.map((sample, index) => ({
          id: sample.id ?? randomUUID(),
          profileId: WORKSPACE_PROFILE_ID,
          body: sample.body,
          sortOrder: index,
        })),
      );
    }

    return this.getWorkspaceProfile();
  }

  async addPhoto(input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    await this.ensureProfileRow();
    const [photo] = await this.db
      .insert(uploadedPhotos)
      .values({
        id: randomUUID(),
        profileId: WORKSPACE_PROFILE_ID,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      })
      .returning();
    return photo;
  }

  async getPhoto(photoId: string) {
    const [photo] = await this.db
      .select()
      .from(uploadedPhotos)
      .where(eq(uploadedPhotos.id, photoId))
      .limit(1);
    return photo ?? null;
  }

  async deletePhoto(photoId: string) {
    const photo = await this.getPhoto(photoId);
    if (!photo) {
      return null;
    }
    await this.db.delete(uploadedPhotos).where(eq(uploadedPhotos.id, photoId));
    return photo;
  }

  async photoCount() {
    const rows = await this.db
      .select({ id: uploadedPhotos.id })
      .from(uploadedPhotos)
      .where(eq(uploadedPhotos.profileId, WORKSPACE_PROFILE_ID));
    return rows.length;
  }

  private async ensureProfileRow() {
    const existing = await this.getWorkspaceProfile();
    if (existing) {
      return;
    }

    await this.db.insert(profiles).values({
      id: WORKSPACE_PROFILE_ID,
    });
  }
}
