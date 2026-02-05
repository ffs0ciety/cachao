<template>
  <div class="min-h-screen bg-white">
    <div class="container mx-auto px-4 py-12 max-w-6xl">
      <!-- Loading state -->
      <div v-if="loading" class="text-center py-16">
        <p class="text-gray-500">Loading event...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
        <p class="font-semibold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <!-- Event details -->
      <div v-else-if="event" class="mb-12">
        <!-- Event Image -->
        <div class="w-full h-96 md:h-[500px] overflow-hidden bg-gray-100 rounded-2xl mb-8 relative">
          <div v-if="!eventImageLoaded && event.image_url" class="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center z-10">
            <svg class="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <img
            v-if="event.image_url"
            :src="event.image_url"
            :alt="event.name"
            class="w-full h-full object-cover transition-opacity duration-300"
            :class="{ 'opacity-0': !eventImageLoaded, 'opacity-100': eventImageLoaded }"
            @load="eventImageLoaded = true"
            @error="eventImageLoaded = true"
          />
          <div v-else class="absolute inset-0 bg-gray-100 flex items-center justify-center">
            <svg class="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        
        <!-- Event Header -->
        <div class="mb-8">
          <div class="flex justify-between items-start mb-4">
            <h1 class="text-4xl font-semibold text-gray-900">{{ event.name }}</h1>
            <NuxtLink
              v-if="isEventOwner"
              :to="`/events/edit/${event.id}`"
              class="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
            >
              Manage Event
            </NuxtLink>
          </div>
          
          <p v-if="event.description" class="text-lg text-gray-600 mb-6 leading-relaxed">
            {{ event.description }}
          </p>

          <div class="flex flex-wrap gap-8 text-gray-600">
            <div>
              <span class="text-sm font-medium text-gray-500 block mb-1">Start Date</span>
              <span class="text-base">{{ formatDate(event.start_date) }}</span>
            </div>
            <div v-if="event.end_date">
              <span class="text-sm font-medium text-gray-500 block mb-1">End Date</span>
              <span class="text-base">{{ formatDate(event.end_date) }}</span>
            </div>
            <div v-if="event.owner_name">
              <span class="text-sm font-medium text-gray-500 block mb-1">Created by</span>
              <span class="text-base">{{ event.owner_name }}</span>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-200 mb-8">
          <nav class="flex space-x-8 overflow-x-auto" aria-label="Tabs">
            <button
              v-if="isEventStaff && myEventInfo"
              @click="activeMainTab = 'my-info'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                activeMainTab === 'my-info'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              My Info
            </button>
            <button
              @click="activeMainTab = 'tickets'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                activeMainTab === 'tickets'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              Tickets
            </button>
            <button
              @click="activeMainTab = 'artists'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                activeMainTab === 'artists'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              {{ isEventOwner ? 'Team' : 'Artists' }}
            </button>
            <button
              @click="activeMainTab = 'media'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                activeMainTab === 'media'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              Media
            </button>
          </nav>
        </div>
      </div>

      <!-- My Event Info Section (for staff/artists) -->
      <div v-if="event && isEventStaff && myEventInfo && activeMainTab === 'my-info'" class="mb-12">
        <div class="bg-white rounded-2xl p-8 border border-gray-100">
          <h2 class="text-2xl font-semibold text-gray-900 mb-8">My Event Information</h2>
          
          <div class="grid md:grid-cols-2 gap-8 mb-8">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-6">Personal Information</h3>
              <div class="space-y-4">
                <div>
                  <span class="text-sm font-medium text-gray-500 block mb-1">Name</span>
                  <p class="text-gray-900">{{ myEventInfo.staff.name }}</p>
                </div>
                <div>
                  <span class="text-sm font-medium text-gray-500 block mb-1">Role</span>
                  <p class="text-gray-900 capitalize">{{ myEventInfo.staff.role }}</p>
                </div>
                <div v-if="myEventInfo.staff.email">
                  <span class="text-sm font-medium text-gray-500 block mb-1">Email</span>
                  <p class="text-gray-900">{{ myEventInfo.staff.email }}</p>
                </div>
                <div v-if="myEventInfo.staff.phone">
                  <span class="text-sm font-medium text-gray-500 block mb-1">Phone</span>
                  <p class="text-gray-900">{{ myEventInfo.staff.phone }}</p>
                </div>
                <div v-if="myEventInfo.staff.notes">
                  <span class="text-sm font-medium text-gray-500 block mb-1">Notes</span>
                  <p class="text-gray-900">{{ myEventInfo.staff.notes }}</p>
                </div>
                <div v-if="myEventInfo.staff.subcategories && myEventInfo.staff.subcategories.length > 0">
                  <span class="text-sm font-medium text-gray-500 block mb-2">Categories</span>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="cat in myEventInfo.staff.subcategories"
                      :key="cat"
                      class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                    >
                      {{ cat }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-if="myEventInfo.staff.image_url" class="flex justify-center">
              <img
                :src="myEventInfo.staff.image_url"
                :alt="myEventInfo.staff.name"
                class="w-48 h-48 object-cover rounded-2xl"
              />
            </div>
          </div>

          <!-- Flights Section -->
          <div class="mb-8">
            <h3 class="text-lg font-semibold text-gray-900 mb-6">Flights</h3>
            <div v-if="myEventInfo.flights && myEventInfo.flights.length > 0" class="space-y-4">
              <div
                v-for="flight in myEventInfo.flights"
                :key="flight.id"
                class="border border-gray-100 rounded-xl p-6 bg-gray-50"
              >
                <div class="flex justify-between items-start mb-4">
                  <div>
                    <h4 class="font-semibold text-gray-900">
                      {{ flight.flight_number }} ({{ flight.airline_code }})
                    </h4>
                    <p class="text-sm text-gray-600 capitalize mt-1">{{ flight.flight_type }}</p>
                  </div>
                  <span
                    v-if="flight.status"
                    class="px-3 py-1 bg-white text-gray-700 rounded-full text-xs font-medium border border-gray-200"
                  >
                    {{ flight.status }}
                  </span>
                </div>
                
                <div class="grid md:grid-cols-2 gap-6 mt-6">
                  <div v-if="flight.departure_airport_code || flight.departure_city">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Departure</p>
                    <p class="text-gray-900 font-medium">
                      {{ flight.departure_airport_code || flight.departure_city }}
                      <span v-if="flight.departure_airport_name" class="text-gray-600 font-normal"> - {{ flight.departure_airport_name }}</span>
                    </p>
                    <p v-if="flight.departure_date" class="text-sm text-gray-600 mt-1">
                      {{ formatDateShort(flight.departure_date) }}
                      <span v-if="flight.departure_time"> at {{ flight.departure_time }}</span>
                    </p>
                  </div>
                  
                  <div v-if="flight.arrival_airport_code || flight.arrival_city">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Arrival</p>
                    <p class="text-gray-900 font-medium">
                      {{ flight.arrival_airport_code || flight.arrival_city }}
                      <span v-if="flight.arrival_airport_name" class="text-gray-600 font-normal"> - {{ flight.arrival_airport_name }}</span>
                    </p>
                    <p v-if="flight.arrival_date" class="text-sm text-gray-600 mt-1">
                      {{ formatDateShort(flight.arrival_date) }}
                      <span v-if="flight.arrival_time"> at {{ flight.arrival_time }}</span>
                    </p>
                  </div>
                </div>
                
                <div v-if="flight.aircraft_type" class="mt-4 text-sm text-gray-600">
                  Aircraft: {{ flight.aircraft_type }}
                </div>
              </div>
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              <p>No flights added yet.</p>
            </div>
          </div>

          <!-- Accommodations Section -->
          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-6">Accommodations</h3>
            <div v-if="myEventInfo.accommodations && myEventInfo.accommodations.length > 0" class="space-y-4">
              <div
                v-for="acc in myEventInfo.accommodations"
                :key="acc.id"
                class="border border-gray-100 rounded-xl p-6 bg-gray-50"
              >
                <h4 class="font-semibold text-gray-900 mb-4">{{ acc.name }}</h4>
                
                <div class="grid md:grid-cols-2 gap-6">
                  <div v-if="acc.address">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Address</p>
                    <p class="text-gray-900">{{ acc.address }}</p>
                  </div>
                  
                  <div v-if="acc.city">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">City</p>
                    <p class="text-gray-900">{{ acc.city }}</p>
                  </div>
                  
                  <div v-if="acc.check_in_date">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Check-in</p>
                    <p class="text-gray-900">{{ formatDateShort(acc.check_in_date) }}</p>
                  </div>
                  
                  <div v-if="acc.check_out_date">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Check-out</p>
                    <p class="text-gray-900">{{ formatDateShort(acc.check_out_date) }}</p>
                  </div>
                  
                  <div v-if="acc.assignment_notes" class="md:col-span-2">
                    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Notes</p>
                    <p class="text-gray-900">{{ acc.assignment_notes }}</p>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              <p>No accommodations assigned yet.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tickets Section -->
      <div v-if="event && activeMainTab === 'tickets'" class="mb-12">
        <div class="bg-white rounded-2xl p-8 border border-gray-100">
          <TicketPurchase :event-id="eventId" />
        </div>
      </div>

      <!-- Artists Section with Selector (Public View) -->
      <div v-if="event && !isEventOwner && activeMainTab === 'artists'" class="mb-12">
        <div class="bg-white rounded-2xl p-8 border border-gray-100">
          <h2 class="text-2xl font-semibold text-gray-900 mb-6">Artists</h2>
          
          <!-- Category Selector -->
          <div class="mb-8 flex flex-wrap gap-2">
            <button
              v-for="category in artistCategories"
              :key="category.value"
              @click="selectedArtistCategory = category.value"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-colors text-sm',
                selectedArtistCategory === category.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              ]"
            >
              {{ category.label }}
            </button>
          </div>

          <!-- Artists List -->
          <PublicArtists 
            :event-id="eventId" 
            :category="selectedArtistCategory"
          />
        </div>
      </div>

      <!-- Staff & Artists Section (Event Owner View) -->
      <div v-if="event && isEventOwner && activeMainTab === 'artists'" class="mb-12">
        <div class="bg-white rounded-2xl p-8 border border-gray-100">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-semibold text-gray-900">Team</h2>
            <NuxtLink
              :to="`/events/staff/${eventId}`"
              class="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors font-medium"
            >
              <span>Manage</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </NuxtLink>
          </div>
          <EventStaff :event-id="eventId" :is-event-owner="isEventOwner" />
        </div>
      </div>

      <!-- Note: Flights are now managed per staff member. See Staff & Artists section above. -->

      <!-- Media Section -->
      <div v-if="event && activeMainTab === 'media'" class="mb-12">
        <!-- Video Upload Section -->
        <div class="mb-8">
          <div v-if="!isAuthenticated" class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <p class="text-sm text-yellow-800">
              <span class="font-medium">Please sign in</span> to upload videos to this event.
            </p>
          </div>
          <VideoUpload v-if="isAuthenticated" :default-event-id="parseInt(eventId)" @uploaded="handleVideoUploaded" />
        </div>

        <!-- Videos and Albums section with tabs -->
        <div class="bg-white rounded-2xl p-8 border border-gray-100">
        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-8">
          <nav class="flex space-x-8" aria-label="Tabs">
            <button
              @click="activeTab = 'videos'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'videos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              All Videos
              <span v-if="videos.length > 0" class="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                {{ videos.length }}
              </span>
            </button>
            <button
              @click="activeTab = 'albums'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'albums'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              Albums
              <span v-if="albums.length > 0" class="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                {{ albums.length }}
              </span>
            </button>
          </nav>
        </div>

        <!-- All Videos Tab -->
        <div v-if="activeTab === 'videos'">

        <!-- Videos loading -->
        <div v-if="videosLoading" class="text-center py-12">
          <p class="text-gray-500">Loading videos...</p>
        </div>

        <!-- Videos error -->
        <div v-else-if="videosError" class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <p>{{ videosError }}</p>
        </div>

        <!-- No videos -->
        <div v-else-if="videos.length === 0" class="text-center py-16 text-gray-500">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p class="text-lg">No videos uploaded yet for this event</p>
        </div>

        <!-- Bulk actions for selected videos -->
        <div v-if="selectedVideos.size > 0 && isAuthenticated" class="mb-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-900">
              {{ selectedVideos.size }} video{{ selectedVideos.size > 1 ? 's' : '' }} selected
            </span>
            <button
              @click="clearSelection"
              class="px-3 py-1.5 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm border border-gray-200 font-medium"
            >
              Clear
            </button>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <!-- Category selector -->
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700">Set Category:</label>
              <select
                v-model="bulkCategory"
                class="text-sm bg-white border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
              >
                <option value="">-- Select Category --</option>
                <option value="shows">Shows</option>
                <option value="social">Social</option>
                <option value="workshops">Workshops</option>
                <option value="demos">Demos</option>
                <option value="null">Remove Category</option>
              </select>
              <button
                @click="handleBulkCategoryUpdate"
                :disabled="!bulkCategory || updatingCategory"
                class="px-4 py-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {{ updatingCategory ? 'Updating...' : 'Apply' }}
              </button>
            </div>
            <!-- Delete button -->
            <button
              @click="handleBulkDelete"
              :disabled="deleting"
              class="px-4 py-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {{ deleting ? 'Deleting...' : `Delete ${selectedVideos.size}` }}
            </button>
          </div>
        </div>

        <!-- Videos grid -->
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="video in videos"
            :key="video.id"
            class="border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 bg-white group"
          >
            <!-- Video player -->
            <div 
              class="flex items-center justify-center relative group w-full overflow-hidden"
              :style="getVideoContainerStyle(video.id)"
            >
              <!-- Loading placeholder for thumbnail -->
              <div 
                v-if="!video.thumbnail_url && !videoThumbnails[video.id] && !videoPlaying[video.id]"
                class="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center z-0"
              >
                <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              
              <!-- Thumbnail (from server or captured from video) - shown when video is not playing -->
              <img
                v-if="(video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id]"
                :src="videoThumbnails[video.id] || video.thumbnail_url"
                :alt="video.title || 'Video thumbnail'"
                class="w-full h-full object-contain cursor-pointer absolute inset-0 z-10 bg-black"
                @click="playVideo(video.id)"
              />
              
              <!-- Play button overlay on thumbnail -->
              <div
                v-if="(video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id]"
                class="absolute inset-0 flex items-center justify-center z-20 cursor-pointer bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200"
                @click="playVideo(video.id)"
              >
                <div class="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg hover:bg-opacity-100 transition-all">
                  <svg class="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
              
              <!-- Video element - shown when playing or if no thumbnail yet -->
              <video
                v-if="video.video_url"
                :ref="el => setVideoRef(video.id, el)"
                :src="video.video_url"
                :class="[
                  'w-full h-full object-contain absolute inset-0',
                  (video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id] ? 'hidden z-0' : 'block z-30'
                ]"
                controls
                preload="metadata"
                @loadedmetadata="onVideoLoaded($event, video.id)"
                @play="onVideoPlay(video.id)"
                @pause="onVideoPause(video.id)"
                @click.stop
              >
                Your browser does not support the video tag.
              </video>
              <div v-else class="text-gray-400 aspect-video w-full flex items-center justify-center bg-gray-100 absolute inset-0">
                <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <!-- Video info -->
            <div class="p-4">
              <div class="flex items-center justify-between gap-2 mb-2">
                <h3 class="font-semibold text-gray-900 flex-1 group-hover:text-primary transition-colors">{{ video.title || 'Untitled Video' }}</h3>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <!-- Checkbox for user's videos -->
                  <input
                    v-if="isAuthenticated && isUserVideo(video)"
                    type="checkbox"
                    :checked="selectedVideos.has(video.id)"
                    @change="toggleVideoSelection(video.id)"
                    class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <!-- Delete button for user's videos -->
                  <button
                    v-if="isAuthenticated && isUserVideo(video) && !selectedVideos.has(video.id)"
                    @click="handleDeleteVideo(video.id)"
                    :disabled="deleting"
                    class="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    title="Delete video"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <p v-if="video.description" class="text-sm text-gray-600 mb-2 line-clamp-2">
                {{ video.description }}
              </p>
              <!-- Category selector for user's videos -->
              <div v-if="isAuthenticated && isUserVideo(video)" class="mb-2">
                <label class="block text-xs font-medium text-gray-700 mb-1">Category:</label>
                <select
                  :value="video.category || ''"
                  @change="handleCategoryChange(video.id, ($event.target as HTMLSelectElement).value)"
                  class="w-full text-sm bg-white border border-gray-200 rounded-full px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                >
                  <option value="">None</option>
                  <option value="shows">Shows</option>
                  <option value="social">Social</option>
                  <option value="workshops">Workshops</option>
                  <option value="demos">Demos</option>
                </select>
              </div>
              <!-- Display category for non-owner videos -->
              <div v-else-if="video.category" class="mb-2">
                <span class="inline-block text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                  {{ video.category.charAt(0).toUpperCase() + video.category.slice(1) }}
                </span>
              </div>
              <div class="text-xs text-gray-500">
                <p>Uploaded: {{ formatDate(video.created_at) }}</p>
                <p v-if="video.duration_seconds" class="mt-1">
                  Duration: {{ formatDuration(video.duration_seconds) }}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>

        <!-- Albums Tab -->
        <div v-else-if="activeTab === 'albums'">
          <!-- Albums loading -->
          <div v-if="albumsLoading" class="text-center py-12">
            <p class="text-gray-500">Loading albums...</p>
          </div>

          <!-- Albums error -->
          <div v-else-if="albumsError" class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4">
            <p>{{ albumsError }}</p>
          </div>

          <!-- Selected Album View -->
          <div v-else-if="selectedAlbum">
            <div class="mb-6 flex items-center gap-4">
              <button
                @click="selectedAlbum = null"
                class="flex items-center text-primary hover:text-primary-600 transition-colors font-medium"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Albums
              </button>
              <div>
                <h3 class="text-xl font-semibold text-gray-900">{{ selectedAlbum.name }}</h3>
                <p v-if="selectedAlbum.album_date" class="text-sm text-gray-500 mt-1">
                  {{ new Date(selectedAlbum.album_date).toLocaleDateString() }}
                </p>
              </div>
            </div>

            <!-- Videos in selected album -->
            <div v-if="albumVideos.length > 0" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="video in albumVideos"
                :key="video.id"
                class="border border-dark-border rounded-lg overflow-hidden hover:shadow-xl transition-shadow bg-dark-card"
              >
                <!-- Video card content (same as All Videos tab) -->
                <!-- Checkbox for user's videos -->
                <div class="p-4">
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="font-semibold text-dark-text-primary flex-1">{{ video.title || 'Untitled Video' }}</h3>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <input
                        v-if="isAuthenticated && isUserVideo(video)"
                        type="checkbox"
                        :checked="selectedVideos.has(video.id)"
                        @change="toggleVideoSelection(video.id)"
                        class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <button
                        v-if="isAuthenticated && isUserVideo(video) && !selectedVideos.has(video.id)"
                        @click="handleDeleteVideo(video.id)"
                        :disabled="deleting"
                        class="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        title="Delete video"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <!-- Video player (same structure as All Videos) -->
                <div 
                  class="flex items-center justify-center relative group w-full overflow-hidden"
                  :style="getVideoContainerStyle(video.id)"
                >
                  <div 
                    v-if="!video.thumbnail_url && !videoThumbnails[video.id] && !videoPlaying[video.id]"
                    class="absolute inset-0 bg-gray-900 animate-pulse flex items-center justify-center z-0"
                  >
                    <svg class="w-12 h-12 text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <img
                    v-if="(video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id]"
                    :src="videoThumbnails[video.id] || video.thumbnail_url"
                    :alt="video.title || 'Video thumbnail'"
                    class="w-full h-full object-contain cursor-pointer absolute inset-0 z-10 bg-black"
                    @click="playVideo(video.id)"
                  />
                  <!-- Play button overlay on thumbnail -->
                  <div
                    v-if="(video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id]"
                    class="absolute inset-0 flex items-center justify-center z-20 cursor-pointer bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200"
                    @click="playVideo(video.id)"
                  >
                    <div class="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg hover:bg-opacity-100 transition-all">
                      <svg class="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                  <video
                    v-if="video.video_url"
                    :ref="el => setVideoRef(video.id, el)"
                    :src="video.video_url"
                    :class="[
                      'w-full h-full object-contain absolute inset-0',
                      (video.thumbnail_url || videoThumbnails[video.id]) && !videoPlaying[video.id] ? 'hidden z-0' : 'block z-30'
                    ]"
                    controls
                    preload="metadata"
                    @loadedmetadata="onVideoLoaded($event, video.id)"
                    @play="onVideoPlay(video.id)"
                    @pause="onVideoPause(video.id)"
                    @click.stop
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
                <div class="p-4">
                  <p v-if="video.description" class="text-sm text-dark-text-secondary mb-2 line-clamp-2">
                    {{ video.description }}
                  </p>
                  <!-- Category selector for user's videos -->
                  <div v-if="isAuthenticated && isUserVideo(video)" class="mb-2">
                    <label class="block text-xs font-medium text-dark-text-secondary mb-1">Category:</label>
                    <select
                      :value="video.category || ''"
                      @change="handleCategoryChange(video.id, ($event.target as HTMLSelectElement).value)"
                      class="w-full text-sm bg-dark-bg border border-dark-border rounded-full px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-dark-text-primary"
                    >
                      <option value="">None</option>
                      <option value="shows">Shows</option>
                      <option value="social">Social</option>
                      <option value="workshops">Workshops</option>
                      <option value="demos">Demos</option>
                    </select>
                  </div>
                  <!-- Display category for non-owner videos -->
                  <div v-else-if="video.category" class="mb-2">
                    <span class="inline-block text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                      {{ video.category.charAt(0).toUpperCase() + video.category.slice(1) }}
                    </span>
                  </div>
                  <div class="text-xs text-dark-text-muted">
                    <p>Uploaded: {{ formatDate(video.created_at) }}</p>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-12 text-gray-500">
              <p>No videos in this album yet</p>
            </div>
          </div>

          <!-- Albums List -->
          <div v-else>
            <!-- No albums -->
            <div v-if="albums.length === 0" class="text-center py-12 text-gray-500">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p class="text-lg">No albums created yet</p>
            </div>

            <!-- Albums grid -->
            <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="album in albums"
                :key="album.id"
                @click="selectAlbum(album)"
                class="border border-gray-100 rounded-xl p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer bg-white group"
              >
                <div class="flex items-center justify-between mb-4">
                  <div class="flex-1">
                    <h3 class="text-xl font-semibold text-gray-900 group-hover:text-primary transition-colors">{{ album.name }}</h3>
                    <p v-if="album.album_date" class="text-sm text-gray-500 mt-1">
                      {{ new Date(album.album_date).toLocaleDateString() }}
                    </p>
                  </div>
                  <svg class="w-6 h-6 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <p class="text-sm text-gray-600">
                  {{ getAlbumVideoCount(album.id) }} video{{ getAlbumVideoCount(album.id) !== 1 ? 's' : '' }}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Event {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  cognito_sub: string | null;
  created_at: string;
  updated_at: string;
}

interface Video {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  album_name: string | null;
  duration_seconds: number | null;
  cognito_sub: string | null;
  album_id: string | null;
  album_name: string | null;
  category: 'shows' | 'social' | 'workshops' | 'demos' | null;
  created_at: string;
  updated_at: string;
}

interface Album {
  id: string;
  event_id: string;
  name: string;
  album_date?: string | null;
  created_at: string;
  updated_at: string;
}

const route = useRoute();
const router = useRouter();
const { fetchEvent } = useEvents();
const { fetchEventVideos, deleteVideos, updateVideoCategory } = useVideos();
const { fetchEventAlbums } = useAlbums();
const { isAuthenticated, checkAuth, getCognitoSub, getAuthToken, getUserEmail } = useAuth();
const config = useRuntimeConfig();

const eventId = route.params.id as string;
const event = ref<Event | null>(null);
const videos = ref<Video[]>([]);
const albums = ref<Album[]>([]);
const selectedAlbum = ref<Album | null>(null);
const activeTab = ref<'videos' | 'albums'>('videos');
// Default tab: 'my-info' for staff, 'tickets' for others
const activeMainTab = ref<'my-info' | 'tickets' | 'artists' | 'media'>('tickets');
const loading = ref(true);
const videosLoading = ref(true);
const albumsLoading = ref(true);
const error = ref<string | null>(null);
const videosError = ref<string | null>(null);
const albumsError = ref<string | null>(null);

// Track video dimensions for proper aspect ratio
const videoDimensions = ref<Record<string, { width: number; height: number }>>({});
const videoRefs = ref<Record<string, HTMLVideoElement | null>>({});
const videoPlaying = ref<Record<string, boolean>>({});
const videoThumbnails = ref<Record<string, string>>({}); // Store thumbnail data URLs

// Video selection for deletion
const selectedVideos = ref<Set<string>>(new Set());
const currentUserSub = ref<string | null>(null);
const deleting = ref(false);
const bulkCategory = ref<string>('');
const updatingCategory = ref(false);
const isEventStaff = ref(false);
const myEventInfo = ref<{ staff: any; flights: any[]; accommodations: any[] } | null>(null);

// Check if current user is the event owner
const isEventOwner = computed(() => {
  if (!event.value || !currentUserSub.value) {
    return false;
  }
  // Strict check: event must have cognito_sub and it must match exactly
  if (!event.value.cognito_sub) {
    return false;
  }
  return event.value.cognito_sub === currentUserSub.value;
});

// Artist category selector
const selectedArtistCategory = ref<'all' | 'dj' | 'media' | 'teachers' | 'performers' | 'other'>('all');
const artistCategories = [
  { value: 'all' as const, label: 'All Artists' },
  { value: 'dj' as const, label: 'DJs' },
  { value: 'media' as const, label: 'Media' },
  { value: 'teachers' as const, label: 'Teachers' },
  { value: 'performers' as const, label: 'Performers' },
  { value: 'other' as const, label: 'Other' },
];

// Image loading state
const eventImageLoaded = ref(false);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};


const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatDateShort = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const checkIfEventStaff = async () => {
  console.log('checkIfEventStaff called', { isAuthenticated: isAuthenticated.value, eventId });
  
  if (!isAuthenticated.value || !eventId) {
    console.log('Not authenticated or no eventId, setting isEventStaff to false');
    isEventStaff.value = false;
    myEventInfo.value = null;
    return;
  }
  
  try {
    const token = await getAuthToken();
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    const url = `${baseUrl}${basePath}/events/${eventId}/my-info`;
    
    console.log('Checking if event staff, calling:', url);
    
    const response = await $fetch<{ success: boolean; staff?: any; flights?: any[]; accommodations?: any[]; error?: string }>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      server: false,
    });
    
    console.log('Event staff check response:', response);
    console.log('Flights data:', response.flights);
    console.log('Accommodations data:', response.accommodations);
    isEventStaff.value = response.success && !!response.staff;
    
    // Store the full my-info data for display
    if (response.success && response.staff) {
      // Ensure arrays are always arrays, even if undefined or null
      const flights = Array.isArray(response.flights) ? response.flights : [];
      const accommodations = Array.isArray(response.accommodations) ? response.accommodations : [];
      
      myEventInfo.value = {
        staff: response.staff,
        flights: flights,
        accommodations: accommodations,
      };
      console.log('myEventInfo stored:', myEventInfo.value);
      console.log('Flights count:', myEventInfo.value.flights?.length, 'Flights:', flights);
      console.log('Accommodations count:', myEventInfo.value.accommodations?.length, 'Accommodations:', accommodations);
      
      // Set default tab to 'my-info' if user is staff (only if still on default)
      if (activeMainTab.value === 'tickets') {
        activeMainTab.value = 'my-info';
      }
    } else {
      myEventInfo.value = null;
    }
    
    console.log('isEventStaff set to:', isEventStaff.value);
  } catch (err: any) {
    console.error('Error checking if event staff:', err);
    console.error('Error details:', {
      status: err.status,
      statusCode: err.statusCode,
      message: err.message,
      data: err.data,
    });
    
    // If 404, user is not staff - this is expected
    if (err.status === 404 || err.statusCode === 404) {
      console.log('404 - User is not staff for this event');
      isEventStaff.value = false;
      myEventInfo.value = null;
    } else {
      isEventStaff.value = false;
      myEventInfo.value = null;
    }
  }
};

const loadEvent = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchEvent(eventId);
    
    if (response.success && response.event) {
      event.value = response.event;
      // Check if user is staff/artist for this event
      await checkIfEventStaff();
    } else {
      error.value = response.error || 'Failed to fetch event';
    }
  } catch (err: any) {
    console.error('Fetch error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const loadVideos = async () => {
  try {
    videosLoading.value = true;
    videosError.value = null;
    const response = await fetchEventVideos(eventId);
    
    if (response.success && response.videos) {
      videos.value = response.videos;
    } else {
      videosError.value = response.error || 'Failed to fetch videos';
    }
  } catch (err: any) {
    console.error('Fetch videos error:', err);
    videosError.value = err.message || 'An unexpected error occurred';
  } finally {
    videosLoading.value = false;
  }
};

const loadAlbums = async () => {
  albumsLoading.value = true;
  albumsError.value = null;
  try {
    const albumList = await fetchEventAlbums(eventId);
    albums.value = albumList;
  } catch (err: any) {
    console.error('Fetch albums error:', err);
    albumsError.value = err.message || 'An unexpected error occurred';
  } finally {
    albumsLoading.value = false;
  }
};

const selectAlbum = (album: Album) => {
  selectedAlbum.value = album;
};

const getAlbumVideoCount = (albumId: string): number => {
  return videos.value.filter(v => v.album_id === albumId).length;
};

const albumVideos = computed(() => {
  if (!selectedAlbum.value) return [];
  return videos.value.filter(v => v.album_id === selectedAlbum.value!.id);
});

const handleVideoUploaded = async (result: { video_id?: string; s3_key?: string }) => {
  console.log('Video uploaded successfully:', result);
  // Reload videos and albums after upload
  await Promise.all([loadVideos(), loadAlbums()]);
};

// Check if video belongs to current user
const isUserVideo = (video: Video): boolean => {
  if (!currentUserSub.value || !video.cognito_sub) {
    return false;
  }
  return video.cognito_sub === currentUserSub.value;
};

// Toggle video selection
const toggleVideoSelection = (videoId: string) => {
  if (selectedVideos.value.has(videoId)) {
    selectedVideos.value.delete(videoId);
  } else {
    selectedVideos.value.add(videoId);
  }
};

// Clear selection
const clearSelection = () => {
  selectedVideos.value.clear();
};

// Delete single video
const handleDeleteVideo = async (videoId: string) => {
  if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
    return;
  }

  await deleteVideo([videoId]);
};

// Delete multiple videos
const handleBulkDelete = async () => {
  if (selectedVideos.value.size === 0) {
    return;
  }

  if (!confirm(`Are you sure you want to delete ${selectedVideos.value.size} video(s)? This action cannot be undone.`)) {
    return;
  }

  const videoIds = Array.from(selectedVideos.value);
  await deleteVideo(videoIds);
};

// Delete video(s) helper
const deleteVideo = async (videoIds: string[]) => {
  try {
    deleting.value = true;
    const response = await deleteVideos(videoIds);

    if (response.success) {
      // Remove deleted videos from the list
      videos.value = videos.value.filter(v => !videoIds.includes(v.id));
      // Clear selection
      videoIds.forEach(id => selectedVideos.value.delete(id));
      
      // Show success message
      alert(`Successfully deleted ${response.deleted_count || videoIds.length} video(s)`);
    } else {
      alert(`Failed to delete videos: ${response.error || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error('Error deleting videos:', error);
    alert(`Error deleting videos: ${error.message || 'Unknown error'}`);
  } finally {
    deleting.value = false;
  }
};

// Handle category change for single video
const handleCategoryChange = async (videoId: string, category: string) => {
  try {
    const categoryValue = category === '' ? null : category as 'shows' | 'social' | 'workshops' | 'demos';
    const response = await updateVideoCategory(parseInt(videoId), categoryValue);
    
    if (response.success && response.video) {
      // Update the video in the list
      const videoIndex = videos.value.findIndex(v => v.id === videoId);
      if (videoIndex !== -1) {
        videos.value[videoIndex].category = response.video.category;
      }
    } else {
      alert(`Failed to update category: ${response.error || 'Unknown error'}`);
      // Reload videos to revert the change
      await loadVideos();
    }
  } catch (error: any) {
    console.error('Error updating category:', error);
    alert(`Failed to update category: ${error.message || 'Unknown error'}`);
    // Reload videos to revert the change
    await loadVideos();
  }
};

// Handle bulk category update
const handleBulkCategoryUpdate = async () => {
  if (!bulkCategory.value || bulkCategory.value === '' || selectedVideos.value.size === 0) {
    return;
  }

  const categoryValue = bulkCategory.value === 'null'
    ? null 
    : bulkCategory.value as 'shows' | 'social' | 'workshops' | 'demos';

  try {
    updatingCategory.value = true;
    const videoIds = Array.from(selectedVideos.value);
    
    // Update all selected videos
    const updatePromises = videoIds.map(videoId => 
      updateVideoCategory(parseInt(videoId), categoryValue)
    );
    
    const results = await Promise.allSettled(updatePromises);
    
    // Count successes and failures
    let successCount = 0;
    let failureCount = 0;
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
        // Update the video in the list
        const videoIndex = videos.value.findIndex(v => v.id === videoIds[index]);
        if (videoIndex !== -1) {
          videos.value[videoIndex].category = result.value.video?.category || null;
        }
      } else {
        failureCount++;
      }
    });
    
    if (successCount > 0) {
      alert(`Successfully updated category for ${successCount} video(s)${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
    } else {
      alert(`Failed to update categories: ${failureCount} video(s) failed`);
    }
    
    // Clear selection and reset category
    selectedVideos.value.clear();
    bulkCategory.value = '';
  } catch (error: any) {
    console.error('Error updating categories:', error);
    alert(`Failed to update categories: ${error.message || 'Unknown error'}`);
  } finally {
    updatingCategory.value = false;
  }
};

const setVideoRef = (videoId: string, el: HTMLVideoElement | null) => {
  if (el) {
    videoRefs.value[videoId] = el;
  } else {
    // Clean up ref when element is removed
    delete videoRefs.value[videoId];
    delete videoDimensions.value[videoId];
    delete videoPlaying.value[videoId];
    delete videoThumbnails.value[videoId];
  }
};

const captureVideoThumbnail = (video: HTMLVideoElement): Promise<string | null> => {
  return new Promise((resolve) => {
    try {
      // Seek to first frame (0.1 seconds to avoid black frames)
      const originalTime = video.currentTime;
      video.currentTime = 0.1;
      
      // Wait for seeked event
      const onSeeked = () => {
        try {
          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          // Draw video frame to canvas
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            video.currentTime = originalTime;
            video.removeEventListener('seeked', onSeeked);
            resolve(null);
            return;
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to data URL
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          
          // Restore original time
          video.currentTime = originalTime;
          video.removeEventListener('seeked', onSeeked);
          resolve(dataUrl);
        } catch (error) {
          console.error('Error capturing thumbnail:', error);
          video.currentTime = originalTime;
          video.removeEventListener('seeked', onSeeked);
          resolve(null);
        }
      };
      
      video.addEventListener('seeked', onSeeked, { once: true });
      
      // Timeout fallback
      setTimeout(() => {
        video.currentTime = originalTime;
        video.removeEventListener('seeked', onSeeked);
        resolve(null);
      }, 5000);
    } catch (error) {
      console.error('Error setting up thumbnail capture:', error);
      resolve(null);
    }
  });
};

const onVideoLoaded = async (event: Event, videoId: string) => {
  try {
    const video = event.target as HTMLVideoElement;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }
    
    // Check if video is still in the DOM
    if (!video.parentElement) {
      return;
    }
    
    // Store video dimensions for proper aspect ratio display
    videoDimensions.value[videoId] = {
      width: video.videoWidth,
      height: video.videoHeight,
    };
    
    // Capture thumbnail from first frame (only if we don't already have one)
    if (!videoThumbnails.value[videoId]) {
      const thumbnail = await captureVideoThumbnail(video);
      if (thumbnail) {
        videoThumbnails.value[videoId] = thumbnail;
      }
    }
  } catch (error) {
    console.error('Error in onVideoLoaded:', error);
  }
};

const playVideo = (videoId: string) => {
  const video = videoRefs.value[videoId];
  if (video && video.parentElement) {
    try {
      video.play().catch(err => {
        console.error('Error playing video:', err);
      });
      videoPlaying.value[videoId] = true;
    } catch (error) {
      console.error('Error playing video:', error);
    }
  }
};

const onVideoPlay = (videoId: string) => {
  videoPlaying.value[videoId] = true;
};

const onVideoPause = (videoId: string) => {
  videoPlaying.value[videoId] = false;
};

const getVideoContainerStyle = (videoId: string): Record<string, string> => {
  const dimensions = videoDimensions.value[videoId];
  
  if (!dimensions || !dimensions.width || !dimensions.height) {
    // Default to 16:9 aspect ratio while loading
    return {
      aspectRatio: '16 / 9',
    };
  }
  
  // Use the video's natural aspect ratio
  // For very tall videos (portrait), limit max height to prevent excessive vertical space
  const aspectRatio = dimensions.width / dimensions.height;
  const style: Record<string, string> = {
    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
  };
  
  // If video is portrait (height > width), add max-height constraint
  if (aspectRatio < 1) {
    style.maxHeight = '600px';
  }
  
  return style;
};

onMounted(async () => {
  if (process.client) {
    await checkAuth();
    // Get current user's cognito sub for ownership check
    if (isAuthenticated.value) {
      currentUserSub.value = await getCognitoSub();
      console.log('Current user sub loaded:', currentUserSub.value);
    } else {
      currentUserSub.value = null;
    }
    // Reset image loaded state when loading new event
    eventImageLoaded.value = false;
    try {
      await Promise.all([loadEvent(), loadVideos(), loadAlbums()]);
      
      // Check if user is staff (this will also set default tab if staff)
      await checkIfEventStaff();
      
      // Log ownership check after event is loaded
      if (event.value) {
        console.log('Event ownership check:', {
          eventCognitoSub: event.value.cognito_sub,
          currentUserSub: currentUserSub.value,
          isEventOwner: isEventOwner.value,
          match: event.value.cognito_sub === currentUserSub.value,
          isEventStaff: isEventStaff.value
        });
      }
    } catch (err: any) {
      console.error('Error in onMounted:', err);
      error.value = err.message || 'Failed to load event data';
    }
  }
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

