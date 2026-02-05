<template>
  <div class="bg-white rounded-lg shadow-md p-6">
    <h2 class="text-2xl font-semibold text-gray-800 mb-4">Upload Videos</h2>

    <!-- Upload Queue -->
    <div v-if="uploadQueue.length > 0" class="space-y-4 mb-6">
      <h3 class="text-lg font-medium text-gray-700">Upload Queue ({{ uploadQueue.length }})</h3>
      
      <div v-for="(item, index) in uploadQueue" :key="item.id" class="border border-gray-200 rounded-lg p-4">
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">{{ item.file.name }}</p>
            <p class="text-xs text-gray-500">{{ formatFileSize(item.file.size) }}</p>
          </div>
          <div class="ml-4 flex items-center gap-2">
            <span v-if="item.status === 'pending'" class="text-xs text-gray-500">Waiting...</span>
            <span v-else-if="item.status === 'uploading'" class="text-xs text-blue-600">{{ Math.round(item.progress) }}%</span>
            <span v-else-if="item.status === 'success'" class="text-xs text-green-600">✓ Complete</span>
            <span v-else-if="item.status === 'error'" class="text-xs text-red-600">✗ Failed</span>
            <button
              v-if="item.status === 'uploading'"
              @click="cancelFileUpload(item.id)"
              class="text-xs text-red-600 hover:text-red-800"
            >
              Cancel
            </button>
            <button
              v-else-if="item.status === 'error'"
              @click="retryUpload(item.id)"
              class="text-xs text-blue-600 hover:text-blue-800"
            >
              Retry
            </button>
            <button
              v-if="item.status !== 'uploading'"
              @click="removeFromQueue(item.id)"
              class="text-xs text-gray-500 hover:text-gray-700"
            >
              Remove
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div v-if="item.status === 'uploading'" class="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div
            class="bg-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: `${item.progress}%` }"
          ></div>
        </div>

        <!-- Error Message -->
        <div v-if="item.status === 'error' && item.error" class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
          {{ item.error }}
        </div>

        <!-- Success Message -->
        <div v-if="item.status === 'success'" class="mt-2 text-xs text-green-600 bg-green-50 p-2 rounded">
          Uploaded successfully
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex gap-2">
        <button
          @click="startAllUploads"
          :disabled="!hasPendingUploads || isUploading || !isAlbumReady"
          class="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
            <span v-if="isUploading">Uploading...</span>
            <span v-else-if="pendingCount > 0">Upload All ({{ pendingCount }})</span>
            <span v-else>Upload Videos</span>
          </button>
          <button
            @click="clearCompleted"
            :disabled="completedCount === 0"
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Clear Completed
          </button>
          <button
            @click="clearQueue"
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Clear All
          </button>
        </div>
        <p v-if="!isAlbumReady && hasPendingUploads" class="text-sm text-red-600 font-medium">
          ⚠️ Please select or create an album before uploading
        </p>
      </div>
    </div>

    <!-- File Selection -->
    <div class="space-y-4">
      <div v-if="defaultEventId" class="text-sm text-gray-600 bg-blue-50 p-3 rounded">
        <p class="font-medium">Videos will be uploaded to this event</p>
      </div>

      <!-- Album Selection -->
      <div v-if="defaultEventId" class="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <label for="album-select" class="block text-sm font-medium text-gray-700 mb-2">
          Album <span class="text-red-500">*</span>
          <span class="text-xs font-normal text-gray-500 ml-2">(Select existing or create new)</span>
        </label>
        
        <!-- Option 1: Select existing album -->
        <div v-if="!showNewAlbumInput" class="flex gap-2">
          <select
            id="album-select"
            v-model="selectedAlbumId"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            :disabled="albumsLoading"
          >
            <option value="">-- Select an album --</option>
            <option v-for="album in albums" :key="album.id" :value="album.id">
              {{ album.name }}{{ album.album_date ? ` (${new Date(album.album_date).toLocaleDateString()})` : '' }}
            </option>
          </select>
          <button
            type="button"
            @click="showNewAlbumInput = true; selectedAlbumId = null"
            class="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            + Create New
          </button>
        </div>
        
        <!-- Option 2: Create new album inline -->
        <div v-else class="space-y-2">
          <div class="flex gap-2">
            <input
              v-model="newAlbumName"
              type="text"
              placeholder="Enter new album name"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              @keyup.enter="createAlbumAndSelect"
              @blur="handleAlbumInputBlur"
            />
            <input
              v-model="newAlbumDate"
              type="date"
              class="px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Date (optional)"
            />
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              @click="createAlbumAndSelect"
              :disabled="!newAlbumName.trim() || creatingAlbum"
              class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {{ creatingAlbum ? 'Creating...' : 'Create' }}
            </button>
            <button
              type="button"
              @click="showNewAlbumInput = false; newAlbumName = ''; newAlbumDate = ''"
              class="px-4 py-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p class="text-xs text-gray-500">Date is optional - use it for events with multiple sessions (e.g., every Sunday)</p>
        </div>
        
        <p v-if="albumsLoading" class="mt-2 text-xs text-gray-500">Loading albums...</p>
        <p v-if="selectedAlbumId" class="mt-2 text-sm text-green-600">
          ✓ Videos will be added to: <strong>{{ selectedAlbumName }}</strong>
        </p>
      </div>

      <div>
        <label for="video-file-input" class="block text-sm font-medium text-gray-700 mb-2">
          Select Video Files (Multiple)
        </label>
        <div class="flex gap-2">
          <button
            type="button"
            @click="fileInput?.click()"
            class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors font-medium"
          >
            Choose Files
          </button>
          <input
            id="video-file-input"
            type="file"
            ref="fileInput"
            @change="handleFileSelect"
            accept="video/*"
            multiple
            class="hidden"
          />
        </div>
        <p class="mt-2 text-sm text-gray-600">
          You can select multiple video files at once.
          <span v-if="selectedAlbumId"> Videos will be added to: <strong>{{ selectedAlbumName }}</strong></span>
          <span v-else class="text-amber-600"> Please select or create an album before uploading.</span>
        </p>
      </div>
    </div>

    <!-- Summary -->
    <div v-if="uploadQueue.length > 0" class="mt-4 flex items-center justify-between text-sm">
      <div class="flex gap-4">
        <span class="text-gray-600">Total: <strong>{{ uploadQueue.length }}</strong></span>
        <span class="text-blue-600">Uploading: <strong>{{ uploadingCount }}</strong></span>
        <span class="text-green-600">Success: <strong>{{ successCount }}</strong></span>
        <span class="text-red-600">Failed: <strong>{{ errorCount }}</strong></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  defaultEventId?: number;
}

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  result?: { video_id?: string; s3_key?: string };
  abortController?: AbortController;
}

const props = withDefaults(defineProps<Props>(), {
  defaultEventId: undefined,
});

const emit = defineEmits<{
  uploaded: [result: { video_id?: string; s3_key?: string }];
}>();

const { uploadVideo } = useVideos();
const { isAuthenticated, getAuthToken } = useAuth();
const { fetchEventAlbums, createAlbum: createAlbumApi } = useAlbums();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedEventId = ref<number | null>(props.defaultEventId || null);
const selectedAlbumId = ref<string | null>(null);
const albums = ref<Array<{ id: string; name: string; album_date?: string | null }>>([]);
const albumsLoading = ref(false);
const showNewAlbumInput = ref(false);
const newAlbumName = ref('');
const newAlbumDate = ref<string>('');
const creatingAlbum = ref(false);
const uploadQueue = ref<UploadQueueItem[]>([]);

// Computed property to get selected album name
const selectedAlbumName = computed(() => {
  if (!selectedAlbumId.value) return '';
  const album = albums.value.find(a => a.id === selectedAlbumId.value);
  return album ? album.name : '';
});

// Computed property to check if album is ready (selected or name entered)
const isAlbumReady = computed(() => {
  return selectedAlbumId.value !== null || (newAlbumName.value.trim().length > 0 && !creatingAlbum.value);
});

// Computed properties for queue status
const isUploading = computed(() => {
  return uploadQueue.value.some(item => item.status === 'uploading');
});

const hasPendingUploads = computed(() => {
  return uploadQueue.value.some(item => item.status === 'pending');
});

const pendingCount = computed(() => {
  return uploadQueue.value.filter(item => item.status === 'pending').length;
});

const uploadingCount = computed(() => {
  return uploadQueue.value.filter(item => item.status === 'uploading').length;
});

const successCount = computed(() => {
  return uploadQueue.value.filter(item => item.status === 'success').length;
});

const errorCount = computed(() => {
  return uploadQueue.value.filter(item => item.status === 'error').length;
});

const completedCount = computed(() => {
  return uploadQueue.value.filter(item => item.status === 'success' || item.status === 'error').length;
});

const loadAlbums = async () => {
  if (!selectedEventId.value) return;
  try {
    albumsLoading.value = true;
    const albumList = await fetchEventAlbums(selectedEventId.value.toString());
    albums.value = albumList || [];
  } catch (error) {
    console.error('Error loading albums:', error);
    albums.value = [];
  } finally {
    albumsLoading.value = false;
  }
};

// Watch for changes to defaultEventId prop and update selectedEventId
// Use onMounted to ensure composables are fully initialized
onMounted(() => {
  if (props.defaultEventId !== undefined) {
    selectedEventId.value = props.defaultEventId;
    loadAlbums();
  }
});

watch(() => props.defaultEventId, (newValue) => {
  if (newValue !== undefined && newValue !== selectedEventId.value) {
    selectedEventId.value = newValue;
    loadAlbums();
  }
});

const createAlbum = async () => {
  if (!newAlbumName.value.trim() || !selectedEventId.value || creatingAlbum.value) return;
  
  creatingAlbum.value = true;
  try {
    const token = await getAuthToken();
    const albumDate = newAlbumDate.value.trim() || null;
    const album = await createAlbumApi(selectedEventId.value.toString(), newAlbumName.value.trim(), token, albumDate);
    if (album) {
      albums.value.push(album);
      selectedAlbumId.value = album.id;
      showNewAlbumInput.value = false;
      newAlbumName.value = '';
      newAlbumDate.value = '';
    }
  } catch (error) {
    console.error('Error creating album:', error);
    alert('Failed to create album. Please try again.');
  } finally {
    creatingAlbum.value = false;
  }
};

const createAlbumAndSelect = async () => {
  await createAlbum();
};

const handleAlbumInputBlur = () => {
  if (!newAlbumName.value.trim()) {
    showNewAlbumInput.value = false;
  }
};

const startAllUploads = async () => {
  // If no album is selected, try to create one from the input if available
  if (!selectedAlbumId.value && newAlbumName.value.trim() && !creatingAlbum.value) {
    await createAlbumAndSelect();
  }
  
  // If still no album, show error
  if (!selectedAlbumId.value) {
    alert('Please select or create an album before uploading videos.');
    return;
  }
  
  const pendingItems = uploadQueue.value.filter(item => item.status === 'pending');
  
  // Upload all pending files in parallel (with a reasonable limit)
  const maxConcurrent = 3; // Limit concurrent uploads to avoid overwhelming the browser
  const chunks: UploadQueueItem[][] = [];
  
  for (let i = 0; i < pendingItems.length; i += maxConcurrent) {
    chunks.push(pendingItems.slice(i, i + maxConcurrent));
  }

  // Process chunks sequentially, but files within each chunk in parallel
  for (const chunk of chunks) {
    await Promise.all(chunk.map(item => uploadSingleFile(item)));
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const files = Array.from(target.files);
    
    // Add all files to the queue
    files.forEach(file => {
      const queueItem: UploadQueueItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending',
        progress: 0,
      };
      uploadQueue.value.push(queueItem);
    });

    // Clear the input
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
};

const uploadSingleFile = async (queueItem: UploadQueueItem) => {
  const item = uploadQueue.value.find(i => i.id === queueItem.id);
  if (!item) return;

  // Don't check isAuthenticated here - let verifyAuthBeforeUpload handle it
  // The uploadVideo function will check authentication and return proper errors

  item.status = 'uploading';
  item.progress = 0;
  item.error = undefined;
  item.abortController = new AbortController();

  try {
    const result = await uploadVideo(
      item.file,
      selectedEventId.value || undefined,
      selectedAlbumId.value ? parseInt(selectedAlbumId.value) : undefined,
      (progress) => {
        const currentItem = uploadQueue.value.find(i => i.id === queueItem.id);
        if (currentItem) {
          currentItem.progress = progress;
        }
      },
      item.abortController?.signal
    );

    if (result.success) {
      item.status = 'success';
      item.progress = 100;
      item.result = {
        video_id: result.video_id,
        s3_key: result.s3_key,
      };
      
      // Emit success event
      emit('uploaded', result);
    } else {
      item.status = 'error';
      item.error = result.error || 'Upload failed';
    }
  } catch (err: any) {
    console.error('Upload error:', err);
    item.status = 'error';
    item.error = err.message || 'An unexpected error occurred';
  } finally {
    item.abortController = undefined;
  }
};


const cancelFileUpload = (id: string) => {
  const item = uploadQueue.value.find(i => i.id === id);
  if (item && item.abortController) {
    item.abortController.abort();
    item.status = 'error';
    item.error = 'Upload cancelled';
    item.abortController = undefined;
  }
};

const retryUpload = async (id: string) => {
  const item = uploadQueue.value.find(i => i.id === id);
  if (item) {
    item.status = 'pending';
    item.progress = 0;
    item.error = undefined;
    await uploadSingleFile(item);
  }
};

const removeFromQueue = (id: string) => {
  const index = uploadQueue.value.findIndex(i => i.id === id);
  if (index > -1) {
    // Cancel if uploading
    if (uploadQueue.value[index].abortController) {
      uploadQueue.value[index].abortController?.abort();
    }
    uploadQueue.value.splice(index, 1);
  }
};

const clearCompleted = () => {
  uploadQueue.value = uploadQueue.value.filter(item => item.status !== 'success' && item.status !== 'error');
};

const clearQueue = () => {
  // Cancel all active uploads
  uploadQueue.value.forEach(item => {
    if (item.abortController) {
      item.abortController.abort();
    }
  });
  uploadQueue.value = [];
};
</script>

