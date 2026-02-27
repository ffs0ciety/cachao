<template>
  <div class="min-h-screen bg-elevated">
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <!-- Back button -->
      <div class="mb-6">
        <NuxtLink
          to="/"
          class="inline-flex items-center text-primary hover:text-primary-hover transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Events
        </NuxtLink>
      </div>

      <!-- Create Event Form -->
      <div class="bg-surface rounded-lg shadow-md p-6">
        <h1 class="text-3xl font-bold text-text-primary mb-6">Create New Event</h1>

        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- Event Name -->
          <div>
            <label for="name" class="block text-sm font-medium text-text-secondary mb-2">
              Event Name <span class="text-red-500">*</span>
            </label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter event name"
            />
          </div>

          <!-- Description -->
          <div>
            <label for="description" class="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              id="description"
              v-model="formData.description"
              rows="4"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter event description"
            ></textarea>
          </div>

          <!-- Image Upload -->
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Event Image (Optional)
            </label>
            <div v-if="!imagePreview && !selectedImageFile" class="space-y-2">
              <input
                ref="imageInput"
                type="file"
                accept="image/*"
                @change="handleImageSelect"
                class="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-subtle file:text-primary hover:file:opacity-80"
              />
              <p class="text-xs text-text-disabled">Select an image for the event</p>
            </div>
            
            <!-- Image Preview (before upload) -->
            <div v-if="imagePreview && !imageUrl" class="space-y-2">
              <div class="relative inline-block">
                <img
                  :src="imagePreview"
                  alt="Event image preview"
                  class="max-w-full h-64 object-contain border border-border-subtle rounded-md"
                />
                <button
                  type="button"
                  @click="removeImage"
                  class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Image Uploaded Successfully -->
            <div v-if="imageUrl" class="space-y-2">
              <div class="relative inline-block">
                <img
                  :src="imagePreview || imageUrl"
                  alt="Event image"
                  class="max-w-full h-64 object-contain border border-border-subtle rounded-md"
                />
              </div>
              <p class="text-xs text-green-600">✓ Image uploaded successfully</p>
            </div>
          </div>

          <!-- Start Date -->
          <div>
            <label for="start_date" class="block text-sm font-medium text-text-secondary mb-2">
              Start Date <span class="text-red-500">*</span>
            </label>
            <input
              id="start_date"
              v-model="formData.start_date"
              type="datetime-local"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- End Date -->
          <div>
            <label for="end_date" class="block text-sm font-medium text-text-secondary mb-2">
              End Date (Optional)
            </label>
            <input
              id="end_date"
              v-model="formData.end_date"
              type="datetime-local"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- Upload Progress (shown during image upload and event creation) -->
          <div v-if="submitting || uploadingImage" class="space-y-3 bg-info-subtle border border-info/25 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-info">
                <span v-if="uploadingImage">Uploading image...</span>
                <span v-else-if="submitting">Creating event...</span>
              </p>
              <span class="text-sm text-info">{{ Math.round(uploadProgress) }}%</span>
            </div>
            <div class="w-full bg-elevated rounded-full h-2.5">
              <div
                class="bg-info h-2.5 rounded-full transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="error && !submitting && !uploadingImage" class="alert alert-error">
            <p class="font-bold">Error:</p>
            <p>{{ error }}</p>
          </div>

          <!-- Success Message -->
          <div v-if="success" class="alert alert-success">
            <p class="font-bold">Success!</p>
            <p>Event created successfully.</p>
          </div>

          <!-- Submit Button -->
          <div class="flex gap-4">
            <button
              type="submit"
              :disabled="submitting || uploadingImage"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="submitting || uploadingImage">Creating Event...</span>
              <span v-else>Create Event</span>
            </button>
            <NuxtLink
              to="/"
              class="btn btn-secondary"
            >
              Cancel
            </NuxtLink>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { createEvent, generateImageUploadUrl } = useEvents();
const { isAuthenticated, checkAuth } = useAuth();
const router = useRouter();

const imageInput = ref<HTMLInputElement | null>(null);
const formData = ref({
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  image_url: '',
});

const imagePreview = ref<string | null>(null);
const selectedImageFile = ref<File | null>(null);
const imageUrl = ref<string | null>(null);
const uploadingImage = ref(false);
const uploadProgress = ref(0);
const submitting = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Check authentication and set default times
onMounted(async () => {
  if (process.client) {
    await checkAuth();
    if (!isAuthenticated.value) {
      router.push('/');
    }
    
    // Set default times: start at 00:00, end at 23:59
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Default start date: today at 00:00
    formData.value.start_date = `${year}-${month}-${day}T00:00`;
    
    // Default end date: today at 23:59
    formData.value.end_date = `${year}-${month}-${day}T23:59`;
  }
});

const handleImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    error.value = 'Please select an image file';
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    error.value = 'Image size must be less than 10MB';
    return;
  }

  error.value = null;
  
  // Store the file for later upload
  selectedImageFile.value = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const uploadImage = async (file: File) => {
  try {
    // Generate presigned URL
    uploadProgress.value = 15; // URL generation started
    const urlResponse = await generateImageUploadUrl(
      file.name,
      file.size,
      file.type
    );

    if (!urlResponse.success || !urlResponse.upload_url) {
      throw new Error(urlResponse.error || 'Failed to generate upload URL');
    }

    // Upload to S3
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Scale progress from 15% to 50% (image upload is 35% of total progress)
        const imageProgress = (e.loaded / e.total) * 35;
        uploadProgress.value = 15 + imageProgress;
      }
    });

    await new Promise<void>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          imageUrl.value = urlResponse.s3_url || null;
          formData.value.image_url = urlResponse.s3_url || '';
          uploadProgress.value = 50; // Image upload complete
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.open('PUT', urlResponse.upload_url!);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  } catch (err: any) {
    console.error('Error uploading image:', err);
    error.value = err.message || 'Failed to upload image';
    imagePreview.value = null;
    throw err; // Re-throw to stop event creation
  }
};

const removeImage = () => {
  imagePreview.value = null;
  selectedImageFile.value = null;
  imageUrl.value = null;
  formData.value.image_url = '';
  if (imageInput.value) {
    imageInput.value.value = '';
  }
};

const handleSubmit = async () => {
  if (!isAuthenticated.value) {
    error.value = 'Please sign in to create events';
    return;
  }

  error.value = null;
  success.value = false;
  uploadProgress.value = 0;

  try {
    // Step 1: Upload image if one is selected
    if (selectedImageFile.value && !imageUrl.value) {
      uploadingImage.value = true;
      uploadProgress.value = 5; // Start at 5% to show progress started
      
      try {
        await uploadImage(selectedImageFile.value);
      } catch (err: any) {
        // Upload failed, error is already set in uploadImage
        uploadingImage.value = false;
        return;
      }
      
      uploadingImage.value = false;
      // uploadProgress is already at 50% from uploadImage
    } else {
      // No image to upload, start at 50%
      uploadProgress.value = 50;
    }

    // Step 2: Create the event
    submitting.value = true;
    uploadProgress.value = 60; // Event creation started

    // Convert datetime-local format (YYYY-MM-DDTHH:mm) to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)
    const formatDateTime = (dateTimeString: string): string => {
      if (!dateTimeString) return '';
      // Replace T with space
      let formatted = dateTimeString.replace('T', ' ');
      // Add seconds if not present (format should be YYYY-MM-DD HH:mm:ss)
      if (formatted.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
        formatted += ':00';
      }
      return formatted;
    };

    uploadProgress.value = 80; // Event creation in progress

    const result = await createEvent({
      name: formData.value.name,
      description: formData.value.description || undefined,
      start_date: formatDateTime(formData.value.start_date),
      end_date: formData.value.end_date ? formatDateTime(formData.value.end_date) : undefined,
      image_url: formData.value.image_url || undefined,
    });

    uploadProgress.value = 100; // Complete

    if (result.success && result.event) {
      success.value = true;
      // Redirect to the new event page after 1.5 seconds
      setTimeout(() => {
        router.push(`/events/${result.event!.id}`);
      }, 1500);
    } else {
      error.value = result.error || 'Failed to create event';
    }
  } catch (err: any) {
    console.error('Error creating event:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    submitting.value = false;
    uploadingImage.value = false;
  }
};
</script>

