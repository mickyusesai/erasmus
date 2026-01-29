import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { participantAuth } from '../../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../middleware/errorHandler.js';
import { getStorageService } from '../../services/storage/index.js';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed for photos.'));
    }
  },
});

// Validation schemas
const createActivitySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  activityDate: z.string().transform((s) => new Date(s)).optional(),
});

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  activityDate: z.string().transform((s) => new Date(s)).nullable().optional(),
});

// Wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Helper to resize large images
async function resizeImageIfNeeded(buffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // If image is larger than 2000px on any side or larger than 2MB, resize it
    const maxDimension = 2000;
    const maxSize = 2 * 1024 * 1024; // 2MB

    if ((metadata.width && metadata.width > maxDimension) ||
        (metadata.height && metadata.height > maxDimension) ||
        buffer.length > maxSize) {

      let resized = image.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // Convert to JPEG with quality 85 if not already
      if (mimeType !== 'image/jpeg') {
        resized = resized.jpeg({ quality: 85 });
      } else {
        resized = resized.jpeg({ quality: 85 });
      }

      return await resized.toBuffer();
    }

    return buffer;
  } catch (error) {
    console.error('[Dissemination] Error resizing image:', error);
    return buffer; // Return original if resize fails
  }
}

/**
 * GET /api/participant/dissemination/status
 * Get dissemination status for the participant
 */
router.get('/status', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  // Get project with disseminationEnabled
  const project = await prisma.project.findUnique({
    where: { id: participant.projectId },
    select: { disseminationEnabled: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if there are any dissemination activities for participant's country in this project
  const activityCount = await prisma.disseminationActivity.count({
    where: {
      projectId: participant.projectId,
      country: participant.country,
    },
  });

  // Check if participant has uploaded social media posts
  const socialMediaCount = await prisma.socialMediaPost.count({
    where: { participantId: participant.id },
  });

  res.json({
    disseminationEnabled: project.disseminationEnabled,
    hasDisseminationActivity: activityCount > 0,
    hasSocialMediaPost: socialMediaCount > 0,
    activityCount,
    socialMediaCount,
  });
}));

/**
 * GET /api/participant/dissemination/activities
 * Get all dissemination activities for participant's country in their project
 */
router.get('/activities', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  // Check if dissemination is enabled for this project
  const project = await prisma.project.findUnique({
    where: { id: participant.projectId },
    select: { disseminationEnabled: true },
  });

  if (!project?.disseminationEnabled) {
    res.json({ activities: [], disseminationEnabled: false });
    return;
  }

  const activities = await prisma.disseminationActivity.findMany({
    where: {
      projectId: participant.projectId,
      country: participant.country,
    },
    include: {
      photos: {
        orderBy: { uploadedAt: 'asc' },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Map activities with isOwner flag
  const activitiesWithOwnership = activities.map((activity: typeof activities[0]) => ({
    ...activity,
    isOwner: activity.createdById === participant.id,
  }));

  res.json({
    activities: activitiesWithOwnership,
    disseminationEnabled: true,
  });
}));

/**
 * POST /api/participant/dissemination/activities
 * Create a new dissemination activity
 */
router.post('/activities', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  // Check if dissemination is enabled
  const project = await prisma.project.findUnique({
    where: { id: participant.projectId },
    select: { disseminationEnabled: true },
  });

  if (!project?.disseminationEnabled) {
    throw new ForbiddenError('Dissemination is not enabled for this project');
  }

  const result = createActivitySchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const activity = await prisma.disseminationActivity.create({
    data: {
      projectId: participant.projectId,
      country: participant.country,
      title: result.data.title,
      description: result.data.description,
      activityDate: result.data.activityDate || null,
      createdById: participant.id,
    },
    include: {
      photos: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  res.status(201).json({
    ...activity,
    isOwner: true,
  });
}));

/**
 * PATCH /api/participant/dissemination/activities/:id
 * Update a dissemination activity (only by creator)
 */
router.patch('/activities/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const activityId = req.params.id;

  // Check ownership
  const activity = await prisma.disseminationActivity.findUnique({
    where: { id: activityId },
  });

  if (!activity) {
    throw new NotFoundError('Activity not found');
  }

  if (activity.createdById !== participant.id) {
    throw new ForbiddenError('You can only edit activities you created');
  }

  const result = updateActivitySchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const updated = await prisma.disseminationActivity.update({
    where: { id: activityId },
    data: result.data,
    include: {
      photos: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  res.json({
    ...updated,
    isOwner: true,
  });
}));

/**
 * DELETE /api/participant/dissemination/activities/:id
 * Delete a dissemination activity (only by creator)
 */
router.delete('/activities/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const activityId = req.params.id;

  // Check ownership
  const activity = await prisma.disseminationActivity.findUnique({
    where: { id: activityId },
    include: { photos: true },
  });

  if (!activity) {
    throw new NotFoundError('Activity not found');
  }

  if (activity.createdById !== participant.id) {
    throw new ForbiddenError('You can only delete activities you created');
  }

  // Delete photos from storage
  const storage = getStorageService();
  for (const photo of activity.photos) {
    try {
      await storage.delete(photo.storedFilePath);
    } catch (error) {
      console.error('[Dissemination] Failed to delete photo from storage:', error);
    }
  }

  // Delete activity (cascades to photos)
  await prisma.disseminationActivity.delete({
    where: { id: activityId },
  });

  res.json({ success: true });
}));

/**
 * POST /api/participant/dissemination/activities/:id/photos
 * Upload photos to a dissemination activity (only by creator)
 */
router.post(
  '/activities/:id/photos',
  participantAuth,
  upload.array('photos', 10),
  asyncHandler(async (req: Request, res: Response) => {
    const participant = req.participant!;
    const activityId = req.params.id;

    // Check ownership
    const activity = await prisma.disseminationActivity.findUnique({
      where: { id: activityId },
      include: { photos: true },
    });

    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    if (activity.createdById !== participant.id) {
      throw new ForbiddenError('You can only add photos to activities you created');
    }

    // Check photo limit (max 10)
    const currentPhotoCount = activity.photos.length;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      throw new ValidationError('At least one photo is required');
    }

    if (currentPhotoCount + files.length > 10) {
      throw new ValidationError(`You can only upload ${10 - currentPhotoCount} more photos (max 10 per activity)`);
    }

    const storage = getStorageService();
    const uploadedPhotos = [];

    for (const file of files) {
      // Resize image if needed
      const resizedBuffer = await resizeImageIfNeeded(file.buffer, file.mimetype);

      // Generate storage path
      const ext = path.extname(file.originalname) || '.jpg';
      const storagePath = `dissemination/${activityId}/photos/${uuidv4()}${ext}`;

      // Store file
      await storage.store(
        {
          buffer: resizedBuffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: resizedBuffer.length,
        },
        storagePath
      );

      // Create photo record
      const photo = await prisma.disseminationPhoto.create({
        data: {
          disseminationActivityId: activityId,
          storedFilePath: storagePath,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          fileSize: resizedBuffer.length,
        },
      });

      uploadedPhotos.push(photo);
    }

    res.status(201).json({
      photos: uploadedPhotos,
      message: `Uploaded ${uploadedPhotos.length} photos`,
    });
  })
);

/**
 * DELETE /api/participant/dissemination/activities/:activityId/photos/:photoId
 * Delete a photo from a dissemination activity (only by creator)
 */
router.delete('/activities/:activityId/photos/:photoId', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const { activityId, photoId } = req.params;

  // Check ownership of activity
  const activity = await prisma.disseminationActivity.findUnique({
    where: { id: activityId },
  });

  if (!activity) {
    throw new NotFoundError('Activity not found');
  }

  if (activity.createdById !== participant.id) {
    throw new ForbiddenError('You can only delete photos from activities you created');
  }

  // Find and delete photo
  const photo = await prisma.disseminationPhoto.findFirst({
    where: {
      id: photoId,
      disseminationActivityId: activityId,
    },
  });

  if (!photo) {
    throw new NotFoundError('Photo not found');
  }

  // Delete from storage
  const storage = getStorageService();
  try {
    await storage.delete(photo.storedFilePath);
  } catch (error) {
    console.error('[Dissemination] Failed to delete photo from storage:', error);
  }

  // Delete record
  await prisma.disseminationPhoto.delete({
    where: { id: photoId },
  });

  res.json({ success: true });
}));

/**
 * GET /api/participant/dissemination/social-media
 * Get participant's social media posts
 */
router.get('/social-media', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  const posts = await prisma.socialMediaPost.findMany({
    where: { participantId: participant.id },
    orderBy: { uploadedAt: 'desc' },
  });

  res.json({ posts });
}));

/**
 * POST /api/participant/dissemination/social-media
 * Upload a social media post screenshot
 */
router.post(
  '/social-media',
  participantAuth,
  upload.single('screenshot'),
  asyncHandler(async (req: Request, res: Response) => {
    const participant = req.participant!;

    // Check if dissemination is enabled
    const project = await prisma.project.findUnique({
      where: { id: participant.projectId },
      select: { disseminationEnabled: true },
    });

    if (!project?.disseminationEnabled) {
      throw new ForbiddenError('Dissemination is not enabled for this project');
    }

    if (!req.file) {
      throw new ValidationError('Screenshot is required');
    }

    // Resize image if needed
    const resizedBuffer = await resizeImageIfNeeded(req.file.buffer, req.file.mimetype);

    // Generate storage path
    const ext = path.extname(req.file.originalname) || '.jpg';
    const storagePath = `participants/${participant.id}/social-media/${uuidv4()}${ext}`;

    // Store file
    const storage = getStorageService();
    await storage.store(
      {
        buffer: resizedBuffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: resizedBuffer.length,
      },
      storagePath
    );

    // Create post record
    const post = await prisma.socialMediaPost.create({
      data: {
        participantId: participant.id,
        storedFilePath: storagePath,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: resizedBuffer.length,
        description: req.body.description || null,
      },
    });

    res.status(201).json(post);
  })
);

/**
 * DELETE /api/participant/dissemination/social-media/:id
 * Delete a social media post
 */
router.delete('/social-media/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const postId = req.params.id;

  const post = await prisma.socialMediaPost.findFirst({
    where: {
      id: postId,
      participantId: participant.id,
    },
  });

  if (!post) {
    throw new NotFoundError('Social media post not found');
  }

  // Delete from storage
  const storage = getStorageService();
  try {
    await storage.delete(post.storedFilePath);
  } catch (error) {
    console.error('[Dissemination] Failed to delete social media post from storage:', error);
  }

  // Delete record
  await prisma.socialMediaPost.delete({
    where: { id: postId },
  });

  res.json({ success: true });
}));

export default router;
