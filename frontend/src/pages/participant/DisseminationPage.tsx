import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Upload,
  Plus,
  Trash2,
  Image,
  Share2,
  ChevronDown,
  ChevronUp,
  Camera,
  Calendar,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  participantApi,
  DisseminationActivity,
  DisseminationPhoto,
  SocialMediaPost,
} from '../../services/api';
import { clsx } from 'clsx';

interface DisseminationPageProps {
  token: string;
  participantCountry: string;
}

export default function DisseminationPage({ token, participantCountry }: DisseminationPageProps) {
  const queryClient = useQueryClient();
  const [showNewActivityModal, setShowNewActivityModal] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<DisseminationActivity | null>(null);

  // Fetch activities
  const { data: activitiesData, isLoading: activitiesLoading } = useQuery({
    queryKey: ['dissemination-activities', token],
    queryFn: () => participantApi.getDisseminationActivities(token),
  });

  // Fetch social media posts
  const { data: socialMediaData, isLoading: socialMediaLoading } = useQuery({
    queryKey: ['social-media-posts', token],
    queryFn: () => participantApi.getSocialMediaPosts(token),
  });

  const activities = activitiesData?.activities || [];
  const socialMediaPosts = socialMediaData?.posts || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dissemination Activities</h2>
        <p className="text-gray-500 mt-1">
          Share your project dissemination activities and social media posts
        </p>
      </div>

      {/* Dissemination Activities Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-soft flex items-center justify-center">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Dissemination Activities</h3>
                <p className="text-sm text-gray-500">
                  Activities shared by participants from {participantCountry}
                </p>
              </div>
            </div>
            <Button onClick={() => setShowNewActivityModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Activity
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activitiesLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-gray-100 rounded-xl" />
              <div className="h-24 bg-gray-100 rounded-xl" />
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-4">
              {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  token={token}
                  isExpanded={expandedActivityId === activity.id}
                  onToggleExpand={() =>
                    setExpandedActivityId(
                      expandedActivityId === activity.id ? null : activity.id
                    )
                  }
                  onEdit={() => setEditingActivity(activity)}
                  queryClient={queryClient}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Share2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h4 className="font-medium text-gray-900 mb-1">No activities yet</h4>
              <p className="text-sm text-gray-500 mb-4">
                Be the first to share a dissemination activity from {participantCountry}
              </p>
              <Button variant="secondary" onClick={() => setShowNewActivityModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Activity
              </Button>
            </div>
          )}

          {activities.length > 0 && activities.length < 3 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-700">
                We encourage at least 3 photos per activity. Currently you have{' '}
                {activities.reduce((sum, a) => sum + a.photos.length, 0)} photos total.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Social Media Posts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-soft flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Social Media Posts</h3>
              <p className="text-sm text-gray-500">
                Upload screenshots of your social media posts about the project
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SocialMediaSection
            token={token}
            posts={socialMediaPosts}
            isLoading={socialMediaLoading}
            queryClient={queryClient}
          />
        </CardContent>
      </Card>

      {/* New Activity Modal */}
      <ActivityModal
        isOpen={showNewActivityModal}
        onClose={() => setShowNewActivityModal(false)}
        token={token}
        queryClient={queryClient}
      />

      {/* Edit Activity Modal */}
      {editingActivity && (
        <ActivityModal
          isOpen={true}
          onClose={() => setEditingActivity(null)}
          token={token}
          queryClient={queryClient}
          activity={editingActivity}
        />
      )}
    </div>
  );
}

// Activity Card Component
function ActivityCard({
  activity,
  token,
  isExpanded,
  onToggleExpand,
  onEdit,
  queryClient,
}: {
  activity: DisseminationActivity;
  token: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [uploading, setUploading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => participantApi.deleteDisseminationActivity(token, activity.id),
    onSuccess: () => {
      toast.success('Activity deleted');
      queryClient.invalidateQueries({ queryKey: ['dissemination-activities'] });
    },
    onError: () => {
      toast.error('Failed to delete activity');
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      participantApi.deleteDisseminationPhoto(token, activity.id, photoId),
    onSuccess: () => {
      toast.success('Photo deleted');
      queryClient.invalidateQueries({ queryKey: ['dissemination-activities'] });
    },
    onError: () => {
      toast.error('Failed to delete photo');
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (activity.photos.length + acceptedFiles.length > 10) {
        toast.error(`You can only upload ${10 - activity.photos.length} more photos`);
        return;
      }

      setUploading(true);
      try {
        await participantApi.uploadDisseminationPhotos(token, activity.id, acceptedFiles);
        toast.success(`Uploaded ${acceptedFiles.length} photos`);
        queryClient.invalidateQueries({ queryKey: ['dissemination-activities'] });
      } catch {
        toast.error('Failed to upload photos');
      } finally {
        setUploading(false);
      }
    },
    [token, activity.id, activity.photos.length, queryClient]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxSize: 10 * 1024 * 1024,
    disabled: !activity.isOwner || uploading,
  });

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-4 bg-gray-50 cursor-pointer flex items-start justify-between"
        onClick={onToggleExpand}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{activity.title}</h4>
            {!activity.isOwner && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                By {activity.createdBy.firstName}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{activity.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {activity.activityDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(activity.activityDate).toLocaleDateString()}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Image className="w-3 h-3" />
              {activity.photos.length} photos
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Photos Grid */}
          {activity.photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {activity.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  canDelete={activity.isOwner}
                  onDelete={() => deletePhotoMutation.mutate(photo.id)}
                />
              ))}
            </div>
          )}

          {/* Upload Zone (only for owner) */}
          {activity.isOwner && activity.photos.length < 10 && (
            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
                isDragActive
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload
                className={clsx(
                  'w-8 h-8 mx-auto mb-2',
                  isDragActive ? 'text-primary-500' : 'text-gray-400'
                )}
              />
              <p className="text-sm text-gray-600">
                {uploading
                  ? 'Uploading...'
                  : isDragActive
                  ? 'Drop photos here'
                  : `Add more photos (${10 - activity.photos.length} remaining)`}
              </p>
            </div>
          )}

          {/* Actions (only for owner) */}
          {activity.isOwner && (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" size="sm" onClick={onEdit}>
                Edit Details
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this activity?')) {
                    deleteMutation.mutate();
                  }
                }}
                loading={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Photo Card Component
function PhotoCard({
  photo,
  canDelete,
  onDelete,
}: {
  photo: DisseminationPhoto;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const apiBase = import.meta.env.VITE_API_URL || '';

  return (
    <div className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
      <img
        src={`${apiBase}/uploads/${photo.storedFilePath}`}
        alt={photo.originalFilename}
        className="w-full h-full object-cover"
      />
      {canDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Activity Modal Component
function ActivityModal({
  isOpen,
  onClose,
  token,
  queryClient,
  activity,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  queryClient: ReturnType<typeof useQueryClient>;
  activity?: DisseminationActivity;
}) {
  const [title, setTitle] = useState(activity?.title || '');
  const [description, setDescription] = useState(activity?.description || '');
  const [activityDate, setActivityDate] = useState(
    activity?.activityDate ? activity.activityDate.split('T')[0] : ''
  );

  const createMutation = useMutation({
    mutationFn: () =>
      participantApi.createDisseminationActivity(token, {
        title,
        description,
        activityDate: activityDate || undefined,
      }),
    onSuccess: () => {
      toast.success('Activity created');
      queryClient.invalidateQueries({ queryKey: ['dissemination-activities'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to create activity');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      participantApi.updateDisseminationActivity(token, activity!.id, {
        title,
        description,
        activityDate: activityDate || undefined,
      }),
    onSuccess: () => {
      toast.success('Activity updated');
      queryClient.invalidateQueries({ queryKey: ['dissemination-activities'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to update activity');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activity) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activity ? 'Edit Activity' : 'Add Dissemination Activity'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Activity Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Workshop on Erasmus+ at local school"
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the dissemination activity..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all resize-none"
            rows={4}
            required
          />
        </div>
        <Input
          label="Activity Date (optional)"
          type="date"
          value={activityDate}
          onChange={(e) => setActivityDate(e.target.value)}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {activity ? 'Save Changes' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Social Media Section Component
function SocialMediaSection({
  token,
  posts,
  isLoading,
  queryClient,
}: {
  token: string;
  posts: SocialMediaPost[];
  isLoading: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [uploading, setUploading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => participantApi.deleteSocialMediaPost(token, postId),
    onSuccess: () => {
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['social-media-posts'] });
    },
    onError: () => {
      toast.error('Failed to delete post');
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      try {
        for (const file of acceptedFiles) {
          await participantApi.uploadSocialMediaPost(token, file);
        }
        toast.success(`Uploaded ${acceptedFiles.length} screenshot(s)`);
        queryClient.invalidateQueries({ queryKey: ['social-media-posts'] });
      } catch {
        toast.error('Failed to upload screenshot');
      } finally {
        setUploading(false);
      }
    },
    [token, queryClient]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
  });

  const apiBase = import.meta.env.VITE_API_URL || '';

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-200 hover:border-primary-300'
        )}
      >
        <input {...getInputProps()} />
        <Camera
          className={clsx(
            'w-10 h-10 mx-auto mb-3',
            isDragActive ? 'text-primary-500' : 'text-gray-400'
          )}
        />
        <p className="text-gray-600">
          {uploading
            ? 'Uploading...'
            : isDragActive
            ? 'Drop screenshot here'
            : 'Drop social media screenshots here, or click to select'}
        </p>
        <p className="text-xs text-gray-400 mt-1">JPG, PNG or WebP, max 10MB</p>
      </div>

      {/* Posts Grid */}
      {posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="relative group aspect-[4/5] rounded-xl overflow-hidden bg-gray-100"
            >
              <img
                src={`${apiBase}/uploads/${post.storedFilePath}`}
                alt="Social media screenshot"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => {
                  if (confirm('Delete this screenshot?')) {
                    deleteMutation.mutate(post.id);
                  }
                }}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                <p className="text-xs text-white truncate">
                  {new Date(post.uploadedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {posts.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          No social media screenshots uploaded yet
        </p>
      )}
    </div>
  );
}
