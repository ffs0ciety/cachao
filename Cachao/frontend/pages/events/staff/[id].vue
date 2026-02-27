<template>
  <div class="min-h-screen bg-elevated">
    <div class="container mx-auto px-4 py-8">
      <!-- Header -->
      <div class="mb-6">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-4"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </NuxtLink>
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold text-text-primary">Manage Staff & Artists</h1>
          <button
            v-if="isEventOwner"
            @click="showAddForm = !showAddForm"
            class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ showAddForm ? 'Cancel' : 'Add Person' }}
          </button>
        </div>
      </div>

      <!-- Accommodations Management Section -->
      <div v-if="isEventOwner" class="mb-8 bg-surface rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold text-text-primary">Event Accommodations</h2>
          <button
            @click="showAddAccommodationForm = !showAddAccommodationForm"
            class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors shadow-sm font-medium"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ showAddAccommodationForm ? 'Cancel' : 'Add Accommodation' }}
          </button>
        </div>

        <!-- Add Accommodation Form -->
        <div v-if="showAddAccommodationForm" class="mb-6 p-4 bg-elevated rounded-lg border border-border-subtle">
          <h3 class="text-lg font-semibold text-text-secondary mb-4">Add New Accommodation</h3>
          <form @submit.prevent="handleAddAccommodation" class="space-y-4">
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label for="acc-type" class="block text-sm font-medium text-text-secondary mb-2">
                  Type <span class="text-red-500">*</span>
                </label>
                <select
                  id="acc-type"
                  v-model="accommodationFormData.accommodation_type"
                  required
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hotel">Hotel</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="apartment">Apartment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label for="acc-name" class="block text-sm font-medium text-text-secondary mb-2">
                  Name <span class="text-red-500">*</span>
                </label>
                <input
                  id="acc-name"
                  v-model="accommodationFormData.name"
                  type="text"
                  required
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Grand Hotel"
                />
              </div>
            </div>
            <div>
              <label for="acc-address" class="block text-sm font-medium text-text-secondary mb-2">
                Address
              </label>
              <input
                id="acc-address"
                v-model="accommodationFormData.address"
                type="text"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Street address, city, country"
              />
            </div>
            <div>
              <label for="acc-notes" class="block text-sm font-medium text-text-secondary mb-2">
                Notes
              </label>
              <textarea
                id="acc-notes"
                v-model="accommodationFormData.notes"
                rows="3"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional information..."
              ></textarea>
            </div>
            <div v-if="accommodationError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p>{{ accommodationError }}</p>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="addingAccommodation"
                class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <svg v-if="!addingAccommodation" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span v-if="addingAccommodation" class="animate-spin">⏳</span>
                {{ addingAccommodation ? 'Adding...' : 'Add' }}
              </button>
              <button
                type="button"
                @click="showAddAccommodationForm = false"
                class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <!-- Accommodations List -->
        <div v-if="accommodations.length > 0" class="space-y-3">
          <div
            v-for="accommodation in accommodations"
            :key="accommodation.id"
            class="p-4 bg-elevated rounded-xl border border-border-subtle"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h4 class="font-semibold text-text-primary">{{ accommodation.name }}</h4>
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="{
                      'bg-blue-100 text-blue-800': accommodation.accommodation_type === 'hotel',
                      'bg-green-100 text-green-800': accommodation.accommodation_type === 'airbnb',
                      'bg-yellow-100 text-yellow-800': accommodation.accommodation_type === 'apartment',
                      'bg-elevated text-text-primary': accommodation.accommodation_type === 'other'
                    }"
                  >
                    {{ accommodation.accommodation_type }}
                  </span>
                </div>
                <div class="text-sm text-text-secondary space-y-1">
                  <div v-if="accommodation.address">{{ accommodation.address }}</div>
                  <div v-if="accommodation.room_number" class="flex items-center gap-2">
                    Room {{ accommodation.room_number }}
                  </div>
                  <div v-if="accommodation.board_type && accommodation.board_type !== 'none'">
                    {{ accommodation.board_type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) }}
                  </div>
                  <div v-if="accommodation.check_in_date || accommodation.check_out_date">
                    <span v-if="accommodation.check_in_date">{{ formatDate(accommodation.check_in_date) }}</span>
                    <span v-if="accommodation.check_in_date && accommodation.check_out_date"> - </span>
                    <span v-if="accommodation.check_out_date">{{ formatDate(accommodation.check_out_date) }}</span>
                  </div>
                  <div v-if="accommodation.assigned_staff_names && accommodation.assigned_staff_names.length > 0" class="mt-2">
                    <span class="text-text-disabled">Assigned to: {{ accommodation.assigned_staff_names.join(', ') }}</span>
                  </div>
                </div>
              </div>
              <div class="relative group">
                <button
                  @click.stop="accommodationMenuOpen = accommodationMenuOpen === accommodation.id ? null : accommodation.id"
                  class="p-2 text-text-disabled hover:text-text-secondary hover:bg-elevated rounded-full transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                <div
                  v-if="accommodationMenuOpen === accommodation.id"
                  class="absolute right-0 top-8 bg-surface rounded-lg shadow-lg border border-border-subtle py-1 z-10 min-w-[120px]"
                  @click.stop
                >
                  <button
                    @click="toggleEditAccommodation(accommodation); accommodationMenuOpen = null"
                    class="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-elevated flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    @click="confirmDeleteAccommodation(accommodation); accommodationMenuOpen = null"
                    class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <!-- Edit Accommodation Form -->
            <div v-if="editingAccommodation && editingAccommodation.id === accommodation.id" class="p-4 bg-blue-50 rounded-lg border border-blue-200 mt-2">
              <h4 class="text-md font-semibold text-blue-800 mb-3">Edit Accommodation</h4>
              <form @submit.prevent="handleUpdateAccommodation(accommodation)" class="space-y-4">
                <div class="grid md:grid-cols-2 gap-4">
                  <div>
                    <label :for="`edit-acc-type-${accommodation.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Type <span class="text-red-500">*</span>
                    </label>
                    <select
                      :id="`edit-acc-type-${accommodation.id}`"
                      v-model="editingAccommodation.accommodation_type"
                      required
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="hotel">Hotel</option>
                      <option value="airbnb">Airbnb</option>
                      <option value="apartment">Apartment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label :for="`edit-acc-name-${accommodation.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Name <span class="text-red-500">*</span>
                    </label>
                    <input
                      :id="`edit-acc-name-${accommodation.id}`"
                      v-model="editingAccommodation.name"
                      type="text"
                      required
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Grand Hotel"
                    />
                  </div>
                </div>
                <div>
                  <label :for="`edit-acc-address-${accommodation.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Address
                  </label>
                  <input
                    :id="`edit-acc-address-${accommodation.id}`"
                    v-model="editingAccommodation.address"
                    type="text"
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Street address, city, country"
                  />
                </div>
                <div>
                  <label :for="`edit-acc-notes-${accommodation.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Notes
                  </label>
                  <textarea
                    :id="`edit-acc-notes-${accommodation.id}`"
                    v-model="editingAccommodation.notes"
                    rows="3"
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Additional information..."
                  ></textarea>
                </div>
                <div v-if="updatingAccommodation" class="text-sm text-blue-600">
                  Saving changes...
                </div>
                <div v-if="accommodationError" class="text-sm text-red-600">
                  {{ accommodationError }}
                </div>
                    <div class="flex gap-2">
                      <button
                        type="submit"
                        :disabled="updatingAccommodation"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        <svg v-if="!updatingAccommodation" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span v-if="updatingAccommodation" class="animate-spin">⏳</span>
                        {{ updatingAccommodation ? 'Saving...' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        @click="editingAccommodation = null"
                        class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
              </form>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-text-disabled italic">
          No accommodations added yet. Add one to get started.
        </div>
      </div>

      <!-- Add Staff Form -->
      <div v-if="showAddForm && isEventOwner" class="mb-6 bg-surface rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-text-secondary mb-4">Add New Person</h2>
        <form @submit.prevent="handleAddStaff" class="space-y-4">
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="add-name" class="block text-sm font-medium text-text-secondary mb-2">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                id="add-name"
                v-model="addFormData.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter name"
              />
            </div>
            <div>
              <label for="add-role" class="block text-sm font-medium text-text-secondary mb-2">
                Role <span class="text-red-500">*</span>
              </label>
              <select
                id="add-role"
                v-model="addFormData.role"
                required
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="staff">Staff</option>
                <option value="artist">Artist</option>
              </select>
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="add-email" class="block text-sm font-medium text-text-secondary mb-2">
                Email (Optional)
              </label>
              <input
                id="add-email"
                v-model="addFormData.email"
                type="email"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label for="add-phone" class="block text-sm font-medium text-text-secondary mb-2">
                Phone (Optional)
              </label>
              <input
                id="add-phone"
                v-model="addFormData.phone"
                type="tel"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+1 234 567 8900"
              />
            </div>
          </div>
          <!-- Artist Subcategories -->
          <div v-if="addFormData.role === 'artist'">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Subcategories (Optional)
            </label>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  v-model="addFormData.subcategories"
                  value="dj"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span class="text-sm text-text-secondary">DJ</span>
              </label>
              <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  v-model="addFormData.subcategories"
                  value="media"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span class="text-sm text-text-secondary">Media</span>
              </label>
              <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  v-model="addFormData.subcategories"
                  value="teacher"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span class="text-sm text-text-secondary">Teacher</span>
              </label>
              <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  v-model="addFormData.subcategories"
                  value="performer"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span class="text-sm text-text-secondary">Performer</span>
              </label>
            </div>
          </div>
          <div v-if="addFormData.role === 'artist'" class="flex items-center gap-2 p-3 bg-elevated rounded-lg border border-border-subtle">
            <input
              id="add-is-public"
              type="checkbox"
              v-model="addFormData.is_public"
              class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label for="add-is-public" class="text-sm font-medium text-text-secondary cursor-pointer">
              Show in public event view
            </label>
          </div>
          <div>
            <label for="add-notes" class="block text-sm font-medium text-text-secondary mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="add-notes"
              v-model="addFormData.notes"
              rows="3"
              class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional information..."
            ></textarea>
          </div>
          <div>
            <label for="add-image" class="block text-sm font-medium text-text-secondary mb-2">
              Photo (Optional)
            </label>
            <div class="space-y-2">
              <input
                ref="addImageInput"
                id="add-image"
                type="file"
                accept="image/*"
                @change="handleAddImageSelect"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div v-if="addImagePreview || uploadingAddImage" class="relative">
                <img
                  v-if="addImagePreview"
                  :src="addImagePreview"
                  alt="Preview"
                  class="w-32 h-32 object-cover rounded-lg border border-border-subtle"
                />
                <div v-if="uploadingAddImage" class="absolute inset-0 flex items-center justify-center bg-elevated bg-opacity-75 rounded-lg">
                  <span class="text-sm text-text-secondary">Uploading...</span>
                </div>
                <button
                  v-if="addImagePreview && !uploadingAddImage"
                  type="button"
                  @click="removeAddImage"
                  class="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div v-if="addError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{{ addError }}</p>
          </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="adding"
                class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <svg v-if="!adding" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span v-if="adding" class="animate-spin">⏳</span>
                {{ adding ? 'Adding...' : 'Add Person' }}
              </button>
              <button
                type="button"
                @click="showAddForm = false"
                class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
              >
                Cancel
              </button>
            </div>
        </form>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <p class="text-text-secondary">Loading staff...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <p class="font-bold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <!-- Staff List -->
      <div v-else-if="staff.length > 0" class="space-y-4">
        <div
          v-for="member in staff"
          :key="member.id"
          class="bg-surface rounded-lg shadow-md"
          style="overflow: visible;"
        >
          <!-- Staff Member Header -->
          <div 
            class="p-4 border-b border-border-subtle transition-colors"
            :class="{ 
              'bg-blue-50': editingMember && editingMember.id === member.id,
              'cursor-pointer hover:bg-elevated': isEventOwner && (!editingMember || editingMember.id !== member.id)
            }"
            @click="handleCardClick(member)"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 flex items-start gap-4">
                <div v-if="member.image_url" class="flex-shrink-0">
                  <img
                    :src="member.image_url"
                    :alt="member.name"
                    class="w-16 h-16 object-cover rounded-full border-2 border-border-subtle"
                  />
                </div>
                <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-xl font-semibold text-text-primary">{{ member.name }}</h3>
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="member.role === 'staff' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'"
                  >
                    {{ member.role === 'staff' ? 'Staff' : 'Artist' }}
                  </span>
                  <div v-if="member.role === 'artist' && member.subcategories && member.subcategories.length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="subcat in member.subcategories"
                      :key="subcat"
                      class="px-2 py-0.5 text-xs rounded-full bg-elevated text-text-secondary capitalize"
                    >
                      {{ subcat }}
                    </span>
                  </div>
                </div>
                <div class="text-sm text-text-secondary space-y-1">
                  <div v-if="member.email" class="flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {{ member.email }}
                  </div>
                  <div v-if="member.phone" class="flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {{ member.phone }}
                  </div>
                  <div v-if="member.notes" class="text-text-disabled italic mt-2">{{ member.notes }}</div>
                </div>
                </div>
              </div>
              <!-- Action Menu -->
              <div class="relative group flex-shrink-0" @click.stop>
                <button
                  @click.stop="memberMenuOpen = memberMenuOpen === member.id ? null : member.id"
                  class="p-2 text-text-disabled hover:text-text-secondary hover:bg-elevated rounded-full transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                <div
                  v-if="memberMenuOpen === member.id"
                  class="absolute right-0 top-10 bg-surface rounded-lg shadow-lg border border-border-subtle py-1 z-20 min-w-[140px]"
                  @click.stop
                >
                  <button
                    @click="toggleEdit(member); memberMenuOpen = null"
                    class="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-elevated flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {{ editingMember && editingMember.id === member.id ? 'Cancel Edit' : 'Edit' }}
                  </button>
                  <button
                    v-if="isEventOwner"
                    @click="confirmDelete(member); memberMenuOpen = null"
                    class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Edit Form -->
          <div v-if="editingMember && editingMember.id === member.id && isEventOwner" class="p-4 bg-elevated border-b border-border-subtle">
            <h4 class="text-lg font-semibold text-text-secondary mb-4">Edit Information</h4>
            <form @submit.prevent="handleUpdateStaff(member)" class="space-y-4">
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label :for="`edit-name-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Name <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`edit-name-${member.id}`"
                    v-model="editingMember.name"
                    type="text"
                    required
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label :for="`edit-role-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Role <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`edit-role-${member.id}`"
                    v-model="editingMember.role"
                    required
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="artist">Artist</option>
                  </select>
                </div>
              </div>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label :for="`edit-email-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Email
                  </label>
                  <input
                    :id="`edit-email-${member.id}`"
                    v-model="editingMember.email"
                    type="email"
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label :for="`edit-phone-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Phone
                  </label>
                  <input
                    :id="`edit-phone-${member.id}`"
                    v-model="editingMember.phone"
                    type="tel"
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>
              <!-- Artist Subcategories -->
              <div v-if="editingMember.role === 'artist'">
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Subcategories (Optional)
                </label>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                    <input
                      type="checkbox"
                      :value="'dj'"
                      :checked="editingMember.subcategories?.includes('dj')"
                      @change="handleSubcategoryChange('dj', $event)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span class="text-sm text-text-secondary">DJ</span>
                  </label>
                  <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                    <input
                      type="checkbox"
                      :value="'media'"
                      :checked="editingMember.subcategories?.includes('media')"
                      @change="handleSubcategoryChange('media', $event)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span class="text-sm text-text-secondary">Media</span>
                  </label>
                  <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                    <input
                      type="checkbox"
                      :value="'teacher'"
                      :checked="editingMember.subcategories?.includes('teacher')"
                      @change="handleSubcategoryChange('teacher', $event)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span class="text-sm text-text-secondary">Teacher</span>
                  </label>
                  <label class="flex items-center gap-2 p-2 border border-border-subtle rounded-lg hover:bg-elevated cursor-pointer">
                    <input
                      type="checkbox"
                      :value="'performer'"
                      :checked="editingMember.subcategories?.includes('performer')"
                      @change="handleSubcategoryChange('performer', $event)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span class="text-sm text-text-secondary">Performer</span>
                  </label>
                </div>
              </div>
              <div v-if="editingMember.role === 'artist'" class="flex items-center gap-2 p-3 bg-elevated rounded-lg border border-border-subtle">
                <input
                  :id="`edit-is-public-${member.id}`"
                  type="checkbox"
                  v-model="editingMember.is_public"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label :for="`edit-is-public-${member.id}`" class="text-sm font-medium text-text-secondary cursor-pointer">
                  Show in public event view
                </label>
              </div>
              <div>
                <label :for="`edit-notes-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                  Notes
                </label>
                <textarea
                  :id="`edit-notes-${member.id}`"
                  v-model="editingMember.notes"
                  rows="3"
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional information..."
                ></textarea>
              </div>
              <div>
                <label :for="`edit-image-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                  Photo (Optional)
                </label>
                <div class="space-y-2">
                  <input
                    :ref="(el) => { if (el) editImageInput = el as HTMLInputElement }"
                    :id="`edit-image-${member.id}`"
                    type="file"
                    accept="image/*"
                    @change="handleEditImageSelect"
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div v-if="editImagePreview || (editingMember.image_url && !editImagePreview) || uploadingEditImage" class="relative">
                    <img
                      :src="editImagePreview || editingMember.image_url"
                      alt="Preview"
                      class="w-32 h-32 object-cover rounded-lg border border-border-subtle"
                    />
                    <div v-if="uploadingEditImage" class="absolute inset-0 flex items-center justify-center bg-elevated bg-opacity-75 rounded-lg">
                      <span class="text-sm text-text-secondary">Uploading...</span>
                    </div>
                    <button
                      v-if="!uploadingEditImage"
                      type="button"
                      @click="removeEditImage"
                      class="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="updateError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                <p>{{ updateError }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  type="submit"
                  :disabled="updating"
                  class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <span v-if="updating">Saving...</span>
                  <span v-else>Save Changes</span>
                </button>
                <button
                  type="button"
                  @click="editingMember = null"
                  class="px-4 py-2 bg-hover text-text-secondary rounded-full hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <!-- Flights Section -->
          <div class="p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-lg font-semibold text-text-secondary">Flights</h4>
              <button
                v-if="isEventOwner"
                @click="toggleFlightsForm(member)"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                {{ showingFlightsForm === member.id ? 'Cancel' : 'Add Flight' }}
              </button>
            </div>

            <!-- Add Flight Form -->
            <div v-if="showingFlightsForm === member.id && isEventOwner" class="mb-4 p-4 bg-elevated rounded-lg border border-border-subtle">
              <form @submit.prevent="handleAddFlight(member)" class="space-y-4">
                <div class="grid md:grid-cols-2 gap-4">
                  <div>
                    <label :for="`flight-number-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Flight Number <span class="text-red-500">*</span>
                    </label>
                    <input
                      :id="`flight-number-${member.id}`"
                      v-model="flightFormData.flight_number"
                      type="text"
                      required
                      pattern="[A-Z]{2,3}\d+"
                      placeholder="e.g., AA123"
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label :for="`flight-type-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Flight Type <span class="text-red-500">*</span>
                    </label>
                    <select
                      :id="`flight-type-${member.id}`"
                      v-model="flightFormData.flight_type"
                      required
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="departure">Departure</option>
                      <option value="return">Return</option>
                    </select>
                  </div>
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                  <div>
                    <label :for="`departure-date-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Departure Date (optional)
                    </label>
                    <input
                      :id="`departure-date-${member.id}`"
                      v-model="flightFormData.departure_date"
                      type="date"
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label :for="`departure-time-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Departure Time (optional)
                    </label>
                    <input
                      :id="`departure-time-${member.id}`"
                      v-model="flightFormData.departure_time"
                      type="time"
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <!-- Departure Information -->
                <div class="border-t border-border-subtle pt-4">
                  <h4 class="text-sm font-semibold text-text-secondary mb-3">Departure Information (optional)</h4>
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <label :for="`departure-airport-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Departure Airport Code
                      </label>
                      <input
                        :id="`departure-airport-${member.id}`"
                        v-model="flightFormData.departure_airport_code"
                        type="text"
                        maxlength="3"
                        placeholder="e.g., JFK"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                        style="text-transform: uppercase;"
                      />
                    </div>
                    <div>
                      <label :for="`departure-city-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Departure City/Country
                      </label>
                      <input
                        :id="`departure-city-${member.id}`"
                        v-model="flightFormData.departure_city"
                        type="text"
                        placeholder="e.g., New York, USA"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <!-- Arrival Information -->
                <div class="border-t border-border-subtle pt-4">
                  <h4 class="text-sm font-semibold text-text-secondary mb-3">Arrival Information (optional)</h4>
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <label :for="`arrival-date-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Arrival Date (optional)
                      </label>
                      <input
                        :id="`arrival-date-${member.id}`"
                        v-model="flightFormData.arrival_date"
                        type="date"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label :for="`arrival-time-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Arrival Time (optional)
                      </label>
                      <input
                        :id="`arrival-time-${member.id}`"
                        v-model="flightFormData.arrival_time"
                        type="time"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div class="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label :for="`arrival-airport-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Arrival Airport Code
                      </label>
                      <input
                        :id="`arrival-airport-${member.id}`"
                        v-model="flightFormData.arrival_airport_code"
                        type="text"
                        maxlength="3"
                        placeholder="e.g., LAX"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                        style="text-transform: uppercase;"
                      />
                    </div>
                    <div>
                      <label :for="`arrival-city-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Arrival City/Country
                      </label>
                      <input
                        :id="`arrival-city-${member.id}`"
                        v-model="flightFormData.arrival_city"
                        type="text"
                        placeholder="e.g., Los Angeles, USA"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <div v-if="addingFlight" class="text-sm text-blue-600">
                  Adding flight...
                </div>
                <div v-if="flightError" class="text-sm text-red-600">
                  {{ flightError }}
                </div>
                <div class="flex gap-2">
                  <button
                    type="submit"
                    :disabled="addingFlight"
                    class="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Flight
                  </button>
                  <button
                    type="button"
                    @click="showingFlightsForm = null"
                    class="px-4 py-2 bg-hover text-text-secondary rounded-full hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            <!-- Flights List -->
            <div v-if="memberFlights[member.id] && memberFlights[member.id].length > 0" class="space-y-2">
              <template v-for="flight in memberFlights[member.id]" :key="flight.id">
                <!-- Edit Flight Form -->
                <div v-if="editingFlight && editingFlight.id === flight.id && isEventOwner" class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h5 class="text-sm font-semibold text-text-secondary mb-3">Edit Flight</h5>
                  <form @submit.prevent="handleUpdateFlight(member, flight)" class="space-y-4">
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-flight-number-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Flight Number <span class="text-red-500">*</span>
                        </label>
                        <input
                          :id="`edit-flight-number-${flight.id}`"
                          v-model="editingFlight.flight_number"
                          type="text"
                          required
                          pattern="[A-Z]{2,3}\d+"
                          placeholder="e.g., AA123"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label :for="`edit-flight-type-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Flight Type <span class="text-red-500">*</span>
                        </label>
                        <select
                          :id="`edit-flight-type-${flight.id}`"
                          v-model="editingFlight.flight_type"
                          required
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="departure">Departure</option>
                          <option value="return">Return</option>
                        </select>
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-departure-date-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Departure Date
                        </label>
                        <input
                          :id="`edit-departure-date-${flight.id}`"
                          v-model="editingFlight.departure_date"
                          type="date"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label :for="`edit-departure-time-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Departure Time
                        </label>
                        <input
                          :id="`edit-departure-time-${flight.id}`"
                          v-model="editingFlight.departure_time"
                          type="time"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-departure-airport-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Departure Airport Code
                        </label>
                        <input
                          :id="`edit-departure-airport-${flight.id}`"
                          v-model="editingFlight.departure_airport_code"
                          type="text"
                          maxlength="3"
                          placeholder="e.g., JFK"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                          style="text-transform: uppercase;"
                        />
                      </div>
                      <div>
                        <label :for="`edit-departure-city-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Departure City/Country
                        </label>
                        <input
                          :id="`edit-departure-city-${flight.id}`"
                          v-model="editingFlight.departure_city"
                          type="text"
                          placeholder="e.g., New York, USA"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-arrival-date-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Arrival Date
                        </label>
                        <input
                          :id="`edit-arrival-date-${flight.id}`"
                          v-model="editingFlight.arrival_date"
                          type="date"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label :for="`edit-arrival-time-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Arrival Time
                        </label>
                        <input
                          :id="`edit-arrival-time-${flight.id}`"
                          v-model="editingFlight.arrival_time"
                          type="time"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-arrival-airport-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Arrival Airport Code
                        </label>
                        <input
                          :id="`edit-arrival-airport-${flight.id}`"
                          v-model="editingFlight.arrival_airport_code"
                          type="text"
                          maxlength="3"
                          placeholder="e.g., LAX"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                          style="text-transform: uppercase;"
                        />
                      </div>
                      <div>
                        <label :for="`edit-arrival-city-${flight.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Arrival City/Country
                        </label>
                        <input
                          :id="`edit-arrival-city-${flight.id}`"
                          v-model="editingFlight.arrival_city"
                          type="text"
                          placeholder="e.g., Los Angeles, USA"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div v-if="flightError" class="text-sm text-red-600">
                      {{ flightError }}
                    </div>
                    <div class="flex gap-2">
                      <button
                        type="submit"
                        :disabled="updatingFlight"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        <svg v-if="!updatingFlight" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span v-if="updatingFlight" class="animate-spin">⏳</span>
                        {{ updatingFlight ? 'Saving...' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        @click="editingFlight = null"
                        class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
                
                <!-- Flight Item -->
                <div v-else class="p-3 bg-elevated rounded-xl border border-border-subtle hover:bg-elevated transition-colors">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span class="font-semibold text-text-primary">{{ flight.flight_number }}</span>
                        <span
                          class="px-2 py-1 text-xs rounded-full"
                          :class="flight.flight_type === 'departure' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'"
                        >
                          {{ flight.flight_type === 'departure' ? 'Departure' : 'Return' }}
                        </span>
                      </div>
                      <div v-if="flight.departure_airport_code || flight.arrival_airport_code" class="text-sm text-text-secondary">
                        <span v-if="flight.departure_airport_code">{{ flight.departure_airport_code }}</span>
                        <span v-if="flight.departure_airport_code && flight.arrival_airport_code"> → </span>
                        <span v-if="flight.arrival_airport_code">{{ flight.arrival_airport_code }}</span>
                        <span v-if="flight.departure_date" class="ml-2 text-text-disabled">
                          ({{ formatDate(flight.departure_date) }})
                        </span>
                      </div>
                      <div v-else-if="flight.departure_date" class="text-sm text-text-secondary">
                        Departure: {{ formatDate(flight.departure_date) }}
                      </div>
                    </div>
                    <div class="relative group" v-if="isEventOwner">
                      <button
                        @click.stop="flightMenuOpen = flightMenuOpen === flight.id ? null : flight.id"
                        class="p-1.5 text-text-disabled hover:text-text-secondary hover:bg-elevated rounded-full transition-colors"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                      <div
                        v-if="flightMenuOpen === flight.id"
                        class="absolute right-0 top-8 bg-surface rounded-lg shadow-lg border border-border-subtle py-1 z-10 min-w-[120px]"
                        @click.stop
                      >
                        <button
                          @click="startEditFlight(flight); flightMenuOpen = null"
                          class="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-elevated flex items-center gap-2"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          @click="confirmDeleteFlight(member, flight); flightMenuOpen = null"
                          class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
            <div v-else class="text-sm text-text-disabled italic">
              No flights added yet.
            </div>
          </div>

          <!-- Accommodations Section -->
          <div class="p-4 border-t border-border-subtle">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-lg font-semibold text-text-secondary">Accommodations</h4>
              <button
                v-if="isEventOwner"
                @click="toggleAccommodationsForm(member)"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                {{ showingAccommodationsForm === member.id ? 'Cancel' : 'Assign' }}
              </button>
            </div>

            <!-- Assign Accommodation Form -->
            <div v-if="showingAccommodationsForm === member.id && isEventOwner && availableAccommodations.length > 0" class="mb-4 p-4 bg-elevated rounded-lg border border-border-subtle">
              <form @submit.prevent="handleAssignAccommodation(member)" class="space-y-4">
                <div>
                  <label :for="`accommodation-select-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Select Accommodation <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`accommodation-select-${member.id}`"
                    v-model="accommodationAssignFormData[member.id]"
                    required
                    class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    @change="onAccommodationSelected(member)"
                  >
                    <option value="">Choose an accommodation...</option>
                    <option
                      v-for="acc in availableAccommodations"
                      :key="acc.id"
                      :value="acc.id"
                    >
                      {{ acc.name }} ({{ acc.accommodation_type }})
                    </option>
                  </select>
                </div>
                
                <!-- Person-specific details (shown when accommodation is selected) -->
                <div v-if="accommodationAssignFormData[member.id]" class="space-y-4 pt-4 border-t border-border-subtle">
                  <div class="grid md:grid-cols-2 gap-4" v-if="selectedAccommodationType(member) === 'hotel'">
                    <div>
                      <label :for="`room-number-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Room Number
                      </label>
                      <input
                        :id="`room-number-${member.id}`"
                        v-model="accommodationAssignDetails[member.id].room_number"
                        type="text"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 205"
                      />
                    </div>
                    <div>
                      <label :for="`board-type-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Board Type
                      </label>
                      <select
                        :id="`board-type-${member.id}`"
                        v-model="accommodationAssignDetails[member.id].board_type"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="none">None</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="half_board">Half Board</option>
                        <option value="full_board">Full Board</option>
                        <option value="all_inclusive">All Inclusive</option>
                      </select>
                    </div>
                  </div>
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <label :for="`check-in-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Check-in Date
                      </label>
                      <input
                        :id="`check-in-${member.id}`"
                        v-model="accommodationAssignDetails[member.id].check_in_date"
                        type="date"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label :for="`check-out-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Check-out Date
                      </label>
                      <input
                        :id="`check-out-${member.id}`"
                        v-model="accommodationAssignDetails[member.id].check_out_date"
                        type="date"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label :for="`assignment-notes-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Notes
                    </label>
                    <textarea
                      :id="`assignment-notes-${member.id}`"
                      v-model="accommodationAssignDetails[member.id].notes"
                      rows="2"
                      class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Additional information for this assignment..."
                    ></textarea>
                  </div>
                </div>
                
                <div v-if="accommodationError" class="text-sm text-red-600">
                  {{ accommodationError }}
                </div>
                <div class="flex gap-2">
                  <button
                    type="submit"
                    :disabled="assigningAccommodation"
                    class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <svg v-if="!assigningAccommodation" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span v-if="assigningAccommodation" class="animate-spin">⏳</span>
                    {{ assigningAccommodation ? 'Assigning...' : (existingAssignment(member) ? 'Update' : 'Assign') }}
                  </button>
                  <button
                    type="button"
                    @click="showingAccommodationsForm = null"
                    class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            <!-- Accommodations List -->
            <div v-if="memberAccommodations[member.id]?.length > 0" class="space-y-2">
              <div
                v-for="accommodation in memberAccommodations[member.id]"
                :key="accommodation.id"
                class="p-3 bg-elevated rounded-xl border border-border-subtle hover:bg-elevated transition-colors"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="font-semibold text-text-primary">{{ accommodation.name }}</span>
                      <span
                        class="px-2 py-1 text-xs rounded-full"
                        :class="{
                          'bg-blue-100 text-blue-800': accommodation.accommodation_type === 'hotel',
                          'bg-green-100 text-green-800': accommodation.accommodation_type === 'airbnb',
                          'bg-yellow-100 text-yellow-800': accommodation.accommodation_type === 'apartment',
                          'bg-elevated text-text-primary': accommodation.accommodation_type === 'other'
                        }"
                      >
                        {{ accommodation.accommodation_type }}
                      </span>
                    </div>
                    <div class="text-sm text-text-secondary space-y-1">
                      <div v-if="accommodation.room_number" class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Room {{ accommodation.room_number }}
                      </div>
                      <div v-if="accommodation.address" class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {{ accommodation.address }}
                      </div>
                      <div v-if="accommodation.board_type && accommodation.board_type !== 'none'" class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {{ accommodation.board_type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) }}
                      </div>
                      <div v-if="accommodation.check_in_date || accommodation.check_out_date" class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span v-if="accommodation.check_in_date">{{ formatDate(accommodation.check_in_date) }}</span>
                        <span v-if="accommodation.check_in_date && accommodation.check_out_date"> - </span>
                        <span v-if="accommodation.check_out_date">{{ formatDate(accommodation.check_out_date) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="relative group" v-if="isEventOwner">
                    <button
                      @click.stop="assignmentMenuOpen = assignmentMenuOpen === `${member.id}-${accommodation.id}` ? null : `${member.id}-${accommodation.id}`"
                      class="p-1.5 text-text-disabled hover:text-text-secondary hover:bg-elevated rounded-full transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    <div
                      v-if="assignmentMenuOpen === `${member.id}-${accommodation.id}`"
                      class="absolute right-0 top-8 bg-surface rounded-lg shadow-lg border border-border-subtle py-1 z-10 min-w-[120px]"
                      @click.stop
                    >
                      <button
                        @click="toggleEditAccommodationAssignment(member, accommodation); assignmentMenuOpen = null"
                        class="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-elevated flex items-center gap-2"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        @click="confirmUnassignAccommodation(member, accommodation); assignmentMenuOpen = null"
                        class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                <!-- Edit Accommodation Assignment Form -->
                <div v-if="editingAccommodationAssignment && editingAccommodationAssignment.accommodationId === accommodation.id && editingAccommodationAssignment.staffId === member.id" class="p-4 bg-blue-50 rounded-lg border border-blue-200 mt-2">
                  <h4 class="text-md font-semibold text-blue-800 mb-3">Edit Accommodation Assignment</h4>
                  <form @submit.prevent="handleUpdateAccommodationAssignment(member, accommodation)" class="space-y-4">
                    <div class="grid md:grid-cols-2 gap-4" v-if="accommodation.accommodation_type === 'hotel'">
                      <div>
                        <label :for="`edit-assignment-room-${accommodation.id}-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Room Number
                        </label>
                        <input
                          :id="`edit-assignment-room-${accommodation.id}-${member.id}`"
                          v-model="editingAccommodationAssignment.room_number"
                          type="text"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., 205"
                        />
                      </div>
                      <div>
                        <label :for="`edit-assignment-board-${accommodation.id}-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Board Type
                        </label>
                        <select
                          :id="`edit-assignment-board-${accommodation.id}-${member.id}`"
                          v-model="editingAccommodationAssignment.board_type"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="none">None</option>
                          <option value="breakfast">Breakfast</option>
                          <option value="half_board">Half Board</option>
                          <option value="full_board">Full Board</option>
                          <option value="all_inclusive">All Inclusive</option>
                        </select>
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div>
                        <label :for="`edit-assignment-checkin-${accommodation.id}-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Check-in Date
                        </label>
                        <input
                          :id="`edit-assignment-checkin-${accommodation.id}-${member.id}`"
                          v-model="editingAccommodationAssignment.check_in_date"
                          type="date"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label :for="`edit-assignment-checkout-${accommodation.id}-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                          Check-out Date
                        </label>
                        <input
                          :id="`edit-assignment-checkout-${accommodation.id}-${member.id}`"
                          v-model="editingAccommodationAssignment.check_out_date"
                          type="date"
                          class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label :for="`edit-assignment-notes-${accommodation.id}-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                        Notes
                      </label>
                      <textarea
                        :id="`edit-assignment-notes-${accommodation.id}-${member.id}`"
                        v-model="editingAccommodationAssignment.notes"
                        rows="2"
                        class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Additional information for this assignment..."
                      ></textarea>
                    </div>
                    <div v-if="updatingAccommodationAssignment" class="text-sm text-blue-600">
                      Saving changes...
                    </div>
                    <div v-if="accommodationError" class="text-sm text-red-600">
                      {{ accommodationError }}
                    </div>
                    <div class="flex gap-2">
                      <button
                        type="submit"
                        :disabled="updatingAccommodationAssignment"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        <svg v-if="!updatingAccommodationAssignment" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span v-if="updatingAccommodationAssignment" class="animate-spin">⏳</span>
                        {{ updatingAccommodationAssignment ? 'Saving...' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        @click="editingAccommodationAssignment = null"
                        class="px-4 py-2 bg-elevated text-text-secondary rounded-full hover:bg-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div v-else-if="availableAccommodations.length === 0 && isEventOwner" class="text-sm text-text-disabled italic">
              No accommodations available. Add accommodations for this event first.
            </div>
            <div v-else class="text-sm text-text-disabled italic">
              No accommodations assigned yet.
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12 bg-surface rounded-lg shadow-md">
        <p class="text-text-disabled text-lg mb-2">No staff or artists added yet.</p>
        <p v-if="isEventOwner" class="text-sm text-text-disabled">Click "+ Add Person" to get started.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Make this page client-side only to avoid SSR issues
definePageMeta({
  ssr: false
});

interface StaffMember {
  id: string;
  event_id: string;
  name: string;
  role: 'staff' | 'artist';
  email: string | null;
  phone: string | null;
  notes: string | null;
  image_url: string | null;
  is_public?: boolean | null;
  subcategories?: string[];
  created_at: string;
  updated_at: string;
}

interface Flight {
  id: string;
  staff_id: string;
  flight_number: string;
  airline_code: string;
  flight_type: 'departure' | 'return';
  departure_airport_code: string | null;
  departure_airport_name: string | null;
  departure_city: string | null;
  departure_date: string | null;
  departure_time: string | null;
  arrival_airport_code: string | null;
  arrival_airport_name: string | null;
  arrival_city: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  aircraft_type: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

const route = useRoute();
const eventId = route.params.id as string;

// Check if user is event owner
const { user, isAuthenticated, getCognitoSub, checkAuth } = useAuth();
const { fetchEvent } = useEvents();
const event = ref<any>(null);
const currentUserSub = ref<string | null>(null);
const isEventOwner = computed(() => {
  if (!event.value || !currentUserSub.value) {
    return false;
  }
  const result = event.value.cognito_sub === currentUserSub.value;
  return result;
});

// Close menus when clicking outside
onMounted(async () => {
  if (process.client) {
    // Check auth first
    await checkAuth();
    
    // Get current user's cognito sub for ownership check
    if (isAuthenticated.value) {
      currentUserSub.value = await getCognitoSub();
      console.log('Loaded user sub:', currentUserSub.value);
    }
    
    try {
      const eventResponse = await fetchEvent(eventId);
      if (eventResponse.success && eventResponse.event) {
        event.value = eventResponse.event;
        
        console.log('Event ownership check:', {
          isEventOwner: isEventOwner.value,
          currentUserSub: currentUserSub.value,
          eventCognitoSub: event.value.cognito_sub,
          isAuthenticated: isAuthenticated.value,
          match: event.value.cognito_sub === currentUserSub.value
        });
        
        // Redirect if user is not the event owner
        if (!isEventOwner.value) {
          console.log('User is not event owner, redirecting to event page');
          await navigateTo(`/events/${eventId}`);
          return;
        }
      } else {
        // Event not found or error, redirect to home
        console.log('Event not found, redirecting to home');
        await navigateTo('/');
        return;
      }
    } catch (err) {
      console.error('Error loading event:', err);
      await navigateTo('/');
      return;
    }
    await loadStaff();
    await loadAccommodations();

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.relative.group')) {
        accommodationMenuOpen.value = null;
        flightMenuOpen.value = null;
        assignmentMenuOpen.value = null;
        memberMenuOpen.value = null;
      }
    });
  }
});

const { fetchEventStaff, addEventStaff, updateEventStaff, deleteEventStaff, generateStaffImageUploadUrl } = useStaff();
const { fetchStaffFlights, addStaffFlight, updateStaffFlight, deleteStaffFlight } = useFlights();
const {
  fetchEventAccommodations,
  fetchStaffAccommodations,
  addEventAccommodation,
  updateEventAccommodation,
  deleteEventAccommodation,
  assignAccommodationToStaff,
  unassignAccommodationFromStaff,
} = useAccommodations();

const staff = ref<StaffMember[]>([]);
const memberFlights = ref<Record<string, Flight[]>>({});
const accommodations = ref<any[]>([]);
const memberAccommodations = ref<Record<string, any[]>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const showAddForm = ref(false);
const adding = ref(false);
const addError = ref<string | null>(null);
const editingMember = ref<StaffMember | null>(null);
const updating = ref(false);
const updateError = ref<string | null>(null);
const showingFlightsForm = ref<string | null>(null);
const editingFlight = ref<Flight | null>(null);
const addingFlight = ref(false);
const updatingFlight = ref(false);
const flightError = ref<string | null>(null);
const showAddAccommodationForm = ref(false);
const addingAccommodation = ref(false);
const accommodationError = ref<string | null>(null);
const showingAccommodationsForm = ref<string | null>(null);
const assigningAccommodation = ref(false);
const accommodationAssignFormData = ref<Record<string, string>>({});
const accommodationAssignDetails = ref<Record<string, {
  room_number: string;
  board_type: 'none' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';
  check_in_date: string;
  check_out_date: string;
  notes: string;
}>>({});
const editingAccommodation = ref<any | null>(null);
const updatingAccommodation = ref(false);
const editingAccommodationAssignment = ref<{
  accommodationId: string;
  staffId: string;
  room_number: string;
  board_type: 'none' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';
  check_in_date: string;
  check_out_date: string;
  notes: string;
} | null>(null);
const updatingAccommodationAssignment = ref(false);
const accommodationMenuOpen = ref<string | null>(null);
const flightMenuOpen = ref<string | null>(null);
const assignmentMenuOpen = ref<string | null>(null);
const memberMenuOpen = ref<string | null>(null);

const addFormData = ref({
  name: '',
  role: 'staff' as 'staff' | 'artist',
  email: '',
  phone: '',
  notes: '',
  subcategories: [] as string[],
  image_url: '',
  is_public: false,
});

const addImageInput = ref<HTMLInputElement | null>(null);
const addImagePreview = ref<string | null>(null);
const addSelectedImageFile = ref<File | null>(null);
const addImageUrl = ref<string | null>(null);
const uploadingAddImage = ref(false);

const editImageInput = ref<HTMLInputElement | null>(null);
const editImagePreview = ref<string | null>(null);
const editSelectedImageFile = ref<File | null>(null);
const uploadingEditImage = ref(false);

const flightFormData = ref({
  flight_number: '',
  flight_type: 'departure' as 'departure' | 'return',
  departure_date: '',
  departure_time: '',
  departure_airport_code: '',
  departure_city: '',
  arrival_date: '',
  arrival_time: '',
  arrival_airport_code: '',
  arrival_city: '',
});

const accommodationFormData = ref({
  accommodation_type: 'hotel' as 'hotel' | 'airbnb' | 'apartment' | 'other',
  name: '',
  address: '',
  notes: '',
});

const loadStaff = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchEventStaff(eventId);
    
    if (response.success && response.staff) {
      staff.value = response.staff;
      console.log('✅ Staff loaded:', staff.value.length, 'members');
      console.log('✅ Staff data:', staff.value);
      console.log('✅ isEventOwner:', isEventOwner.value);
      console.log('✅ isAuthenticated:', isAuthenticated.value);
      console.log('✅ currentUserSub:', currentUserSub.value);
      // Load flights and accommodations for each staff member
      for (const member of staff.value) {
        await loadFlightsForMember(member.id);
        await loadAccommodationsForMember(member.id);
      }
    } else {
      error.value = response.error || 'Failed to fetch staff';
    }
  } catch (err: any) {
    console.error('Fetch staff error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const loadFlightsForMember = async (staffId: string) => {
  try {
    console.log('Loading flights for staff:', staffId, 'event:', eventId);
    const response = await fetchStaffFlights(eventId, staffId);
    console.log('Flights response:', response);
    if (response.success && response.flights && Array.isArray(response.flights)) {
      // Use Vue's reactivity by creating a new object
      memberFlights.value = {
        ...memberFlights.value,
        [staffId]: response.flights
      };
      console.log('Flights loaded for staff', staffId, ':', response.flights.length, 'flights');
      console.log('Current memberFlights:', memberFlights.value);
    } else {
      console.warn('No flights in response or response not successful:', response);
      memberFlights.value = {
        ...memberFlights.value,
        [staffId]: []
      };
    }
  } catch (err: any) {
    console.error('Error loading flights:', err);
    memberFlights.value = {
      ...memberFlights.value,
      [staffId]: []
    };
  }
};

const handleAddImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    addError.value = 'Please select an image file';
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    addError.value = 'Image size must be less than 10MB';
    return;
  }

  addError.value = null;
  addSelectedImageFile.value = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    addImagePreview.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const uploadAddImage = async (file: File) => {
  try {
    uploadingAddImage.value = true;
    const urlResponse = await generateStaffImageUploadUrl(
      file.name,
      file.size,
      file.type
    );

    if (!urlResponse.success || !urlResponse.upload_url) {
      throw new Error(urlResponse.error || 'Failed to generate upload URL');
    }

    const xhr = new XMLHttpRequest();
    
    await new Promise<void>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          addImageUrl.value = urlResponse.s3_url || null;
          addFormData.value.image_url = urlResponse.s3_url || '';
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
    addError.value = err.message || 'Failed to upload image';
    addImagePreview.value = null;
    throw err;
  } finally {
    uploadingAddImage.value = false;
  }
};

const removeAddImage = () => {
  addImagePreview.value = null;
  addSelectedImageFile.value = null;
  addImageUrl.value = null;
  addFormData.value.image_url = '';
  if (addImageInput.value) {
    addImageInput.value.value = '';
  }
};

const handleEditImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    updateError.value = 'Please select an image file';
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    updateError.value = 'Image size must be less than 10MB';
    return;
  }

  updateError.value = null;
  editSelectedImageFile.value = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    editImagePreview.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const uploadEditImage = async (file: File) => {
  try {
    uploadingEditImage.value = true;
    const urlResponse = await generateStaffImageUploadUrl(
      file.name,
      file.size,
      file.type
    );

    if (!urlResponse.success || !urlResponse.upload_url) {
      throw new Error(urlResponse.error || 'Failed to generate upload URL');
    }

    const xhr = new XMLHttpRequest();
    
    await new Promise<void>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          if (editingMember.value) {
            editingMember.value.image_url = urlResponse.s3_url || null;
          }
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
    updateError.value = err.message || 'Failed to upload image';
    editImagePreview.value = null;
    throw err;
  } finally {
    uploadingEditImage.value = false;
  }
};

const removeEditImage = () => {
  editImagePreview.value = null;
  editSelectedImageFile.value = null;
  if (editingMember.value) {
    editingMember.value.image_url = null;
  }
  if (editImageInput.value) {
    editImageInput.value.value = '';
  }
};

const handleAddStaff = async () => {
  addError.value = null;
  adding.value = true;

  try {
    // Upload image if selected
    if (addSelectedImageFile.value) {
      await uploadAddImage(addSelectedImageFile.value);
    }

    const staffData: any = {
      name: addFormData.value.name,
      role: addFormData.value.role,
    };

    if (addFormData.value.email) staffData.email = addFormData.value.email;
    if (addFormData.value.phone) staffData.phone = addFormData.value.phone;
    if (addFormData.value.notes) staffData.notes = addFormData.value.notes;
    if (addFormData.value.image_url) staffData.image_url = addFormData.value.image_url;
    if (addFormData.value.subcategories && addFormData.value.subcategories.length > 0) {
      staffData.subcategories = addFormData.value.subcategories;
    }
    if (addFormData.value.role === 'artist') {
      staffData.is_public = addFormData.value.is_public || false;
    }

    const result = await addEventStaff(eventId, staffData);

    if (result.success && result.staff) {
      staff.value.push(result.staff);
      memberFlights.value[result.staff.id] = [];
      memberAccommodations.value[result.staff.id] = [];
      addFormData.value = {
        name: '',
        role: 'staff',
        email: '',
        phone: '',
        notes: '',
        subcategories: [],
        image_url: '',
        is_public: false,
      };
      removeAddImage();
      showAddForm.value = false;
    } else {
      addError.value = result.error || 'Failed to add staff member';
    }
  } catch (err: any) {
    console.error('Error adding staff:', err);
    addError.value = err.message || 'An unexpected error occurred';
  } finally {
    adding.value = false;
  }
};

const handleCardClick = (member: StaffMember) => {
  console.log('handleCardClick called', { memberId: member.id, isEventOwner: isEventOwner.value });
  
  if (!isEventOwner.value) {
    alert('You are not the event owner. Only the event owner can edit staff information.');
    return;
  }
  
  toggleEdit(member);
};

const toggleEdit = (member: StaffMember) => {
  console.log('toggleEdit called', { memberId: member.id, currentEditing: editingMember.value?.id });
  
  if (editingMember.value && editingMember.value.id === member.id) {
    // Close edit form
    editingMember.value = null;
    console.log('Edit form closed');
  } else {
    // Open edit form - Create a deep copy and ensure all fields are strings (not null)
    editingMember.value = {
      id: member.id,
      event_id: member.event_id,
      name: member.name,
      role: member.role,
      email: member.email || '',
      phone: member.phone || '',
      notes: member.notes || '',
      image_url: member.image_url || null,
      is_public: member.is_public === true || member.is_public === 1 || member.is_public === 'true' || member.is_public === '1',
      subcategories: member.subcategories ? [...member.subcategories] : [],
      created_at: member.created_at,
      updated_at: member.updated_at,
    };
    editImagePreview.value = member.image_url || null;
    editSelectedImageFile.value = null;
    console.log('Edit form opened', editingMember.value);
  }
  updateError.value = null;
};

const handleSubcategoryChange = (subcategory: string, event: Event) => {
  if (!editingMember.value) return;
  
  const target = event.target as HTMLInputElement;
  if (!editingMember.value.subcategories) {
    editingMember.value.subcategories = [];
  }
  
  if (target.checked) {
    if (!editingMember.value.subcategories.includes(subcategory)) {
      editingMember.value.subcategories.push(subcategory);
    }
  } else {
    editingMember.value.subcategories = editingMember.value.subcategories.filter(
      (sc: string) => sc !== subcategory
    );
  }
};

const handleUpdateStaff = async (member: StaffMember) => {
  if (!editingMember.value) return;
  
  updateError.value = null;
  updating.value = true;

  try {
    // Upload image if a new one was selected
    if (editSelectedImageFile.value) {
      await uploadEditImage(editSelectedImageFile.value);
    }

    const staffData: any = {
      name: editingMember.value.name,
      role: editingMember.value.role,
    };

    // Include fields even if empty (to clear them)
    staffData.email = editingMember.value.email || null;
    staffData.phone = editingMember.value.phone || null;
    staffData.notes = editingMember.value.notes || null;
    
    // Include image_url if it exists or if we want to clear it
    if (editingMember.value.image_url !== undefined) {
      staffData.image_url = editingMember.value.image_url || null;
    }
    
    // Include subcategories if this is an artist
    if (editingMember.value.role === 'artist') {
      staffData.subcategories = editingMember.value.subcategories || [];
      // Always include is_public for artists (explicitly convert to boolean)
      staffData.is_public = Boolean(editingMember.value.is_public);
    }

    const result = await updateEventStaff(eventId, member.id, staffData);

    if (result.success && result.staff) {
      const index = staff.value.findIndex(s => s.id === member.id);
      if (index !== -1) {
        staff.value[index] = result.staff;
      }
      editingMember.value = null;
      editImagePreview.value = null;
      editSelectedImageFile.value = null;
    } else {
      updateError.value = result.error || 'Failed to update staff member';
    }
  } catch (err: any) {
    console.error('Error updating staff:', err);
    updateError.value = err.message || 'An unexpected error occurred';
  } finally {
    updating.value = false;
  }
};

const confirmDelete = (member: StaffMember) => {
  if (confirm(`Are you sure you want to remove "${member.name}"? This will also delete all their flights.`)) {
    handleDelete(member);
  }
};

const handleDelete = async (member: StaffMember) => {
  try {
    const result = await deleteEventStaff(eventId, member.id);
    if (result.success) {
      staff.value = staff.value.filter(s => s.id !== member.id);
      delete memberFlights.value[member.id];
    } else {
      alert(result.error || 'Failed to delete staff member');
    }
  } catch (err: any) {
    console.error('Error deleting staff:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

const toggleFlightsForm = (member: StaffMember) => {
  if (showingFlightsForm.value === member.id) {
    showingFlightsForm.value = null;
    flightFormData.value = {
      flight_number: '',
      flight_type: 'departure',
      departure_date: '',
      departure_time: '',
      departure_airport_code: '',
      departure_city: '',
      arrival_date: '',
      arrival_time: '',
      arrival_airport_code: '',
      arrival_city: '',
    };
  } else {
    showingFlightsForm.value = member.id;
  }
  flightError.value = null;
};

const handleAddFlight = async (member: StaffMember) => {
  flightError.value = null;
  addingFlight.value = true;

  try {
    const flightData: any = {
      flight_number: flightFormData.value.flight_number.toUpperCase().trim(),
      flight_type: flightFormData.value.flight_type,
    };

    // Add optional fields if provided
    if (flightFormData.value.departure_date) {
      flightData.departure_date = flightFormData.value.departure_date;
    }
    if (flightFormData.value.departure_time) {
      flightData.departure_time = flightFormData.value.departure_time;
    }
    if (flightFormData.value.departure_airport_code) {
      flightData.departure_airport_code = flightFormData.value.departure_airport_code.toUpperCase().trim();
    }
    if (flightFormData.value.departure_city) {
      flightData.departure_city = flightFormData.value.departure_city.trim();
    }
    if (flightFormData.value.arrival_date) {
      flightData.arrival_date = flightFormData.value.arrival_date;
    }
    if (flightFormData.value.arrival_time) {
      flightData.arrival_time = flightFormData.value.arrival_time;
    }
    if (flightFormData.value.arrival_airport_code) {
      flightData.arrival_airport_code = flightFormData.value.arrival_airport_code.toUpperCase().trim();
    }
    if (flightFormData.value.arrival_city) {
      flightData.arrival_city = flightFormData.value.arrival_city.trim();
    }

    const result = await addStaffFlight(eventId, member.id, flightData);

    if (result.success && result.flight) {
      if (!memberFlights.value[member.id]) {
        memberFlights.value[member.id] = [];
      }
      memberFlights.value[member.id].push(result.flight);
      flightFormData.value = {
        flight_number: '',
        flight_type: 'departure',
        departure_date: '',
        departure_time: '',
        departure_airport_code: '',
        departure_city: '',
        arrival_date: '',
        arrival_time: '',
        arrival_airport_code: '',
        arrival_city: '',
      };
      showingFlightsForm.value = null;
    } else {
      flightError.value = result.error || 'Failed to add flight';
    }
  } catch (err: any) {
    console.error('Error adding flight:', err);
    flightError.value = err.message || 'An unexpected error occurred';
  } finally {
    addingFlight.value = false;
  }
};

const startEditFlight = (flight: Flight) => {
  editingFlight.value = {
    ...flight,
    departure_date: flight.departure_date ? flight.departure_date.split('T')[0] : '',
    arrival_date: flight.arrival_date ? flight.arrival_date.split('T')[0] : '',
  };
  flightError.value = null;
};

const handleUpdateFlight = async (member: StaffMember, flight: Flight) => {
  if (!editingFlight.value) return;
  
  flightError.value = null;
  updatingFlight.value = true;

  try {
    const flightData: any = {
      flight_number: editingFlight.value.flight_number.toUpperCase().trim(),
      flight_type: editingFlight.value.flight_type,
    };

    // Add optional fields if provided
    if (editingFlight.value.departure_date) {
      flightData.departure_date = editingFlight.value.departure_date;
    }
    if (editingFlight.value.departure_time) {
      flightData.departure_time = editingFlight.value.departure_time;
    }
    if (editingFlight.value.departure_airport_code !== undefined) {
      flightData.departure_airport_code = editingFlight.value.departure_airport_code ? editingFlight.value.departure_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.departure_city !== undefined) {
      flightData.departure_city = editingFlight.value.departure_city ? editingFlight.value.departure_city.trim() : null;
    }
    if (editingFlight.value.arrival_date) {
      flightData.arrival_date = editingFlight.value.arrival_date;
    }
    if (editingFlight.value.arrival_time) {
      flightData.arrival_time = editingFlight.value.arrival_time;
    }
    if (editingFlight.value.arrival_airport_code !== undefined) {
      flightData.arrival_airport_code = editingFlight.value.arrival_airport_code ? editingFlight.value.arrival_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.arrival_city !== undefined) {
      flightData.arrival_city = editingFlight.value.arrival_city ? editingFlight.value.arrival_city.trim() : null;
    }

    const result = await updateStaffFlight(eventId, member.id, flight.id, flightData);

    if (result.success && result.flight) {
      // Update in list
      const index = memberFlights.value[member.id]?.findIndex(f => f.id === flight.id);
      if (index !== undefined && index !== -1 && memberFlights.value[member.id]) {
        memberFlights.value[member.id][index] = result.flight;
      }
      editingFlight.value = null;
    } else {
      flightError.value = result.error || 'Failed to update flight';
    }
  } catch (err: any) {
    console.error('Error updating flight:', err);
    flightError.value = err.message || 'An unexpected error occurred';
  } finally {
    updatingFlight.value = false;
  }
};

const confirmDeleteFlight = (member: StaffMember, flight: Flight) => {
  if (confirm(`Are you sure you want to remove flight ${flight.flight_number}?`)) {
    handleDeleteFlight(member, flight);
  }
};

const handleDeleteFlight = async (member: StaffMember, flight: Flight) => {
  try {
    const result = await deleteStaffFlight(eventId, member.id, flight.id);
    if (result.success) {
      if (memberFlights.value[member.id]) {
        memberFlights.value[member.id] = memberFlights.value[member.id].filter(f => f.id !== flight.id);
      }
    } else {
      alert(result.error || 'Failed to delete flight');
    }
  } catch (err: any) {
    console.error('Error deleting flight:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Accommodation functions
const loadAccommodations = async () => {
  try {
    const response = await fetchEventAccommodations(eventId);
    if (response.success && response.accommodations) {
      accommodations.value = response.accommodations;
    }
  } catch (err: any) {
    console.error('Error loading accommodations:', err);
  }
};

const loadAccommodationsForMember = async (staffId: string) => {
  try {
    const response = await fetchStaffAccommodations(eventId, staffId);
    if (response.success && response.accommodations) {
      memberAccommodations.value[staffId] = response.accommodations;
    }
  } catch (err: any) {
    console.error('Error loading accommodations for member:', err);
    memberAccommodations.value[staffId] = [];
  }
};

const availableAccommodations = computed(() => {
  return accommodations.value.filter(acc => {
    // Filter out accommodations that are already assigned to this member
    // (we'll allow reassignment, but for now show all)
    return true;
  });
});

const handleAddAccommodation = async () => {
  accommodationError.value = null;
  addingAccommodation.value = true;

  try {
    // Validate required fields
    if (!accommodationFormData.value.name || !accommodationFormData.value.name.trim()) {
      accommodationError.value = 'Accommodation name is required';
      addingAccommodation.value = false;
      return;
    }

    const accData: any = {
      accommodation_type: accommodationFormData.value.accommodation_type,
      name: accommodationFormData.value.name.trim(),
    };

    if (accommodationFormData.value.address) accData.address = accommodationFormData.value.address.trim();
    if (accommodationFormData.value.notes) accData.notes = accommodationFormData.value.notes.trim();

    const result = await addEventAccommodation(eventId, accData);

    if (result.success && result.accommodation) {
      accommodations.value.push(result.accommodation);
      accommodationFormData.value = {
        accommodation_type: 'hotel',
        name: '',
        address: '',
        notes: '',
      };
      showAddAccommodationForm.value = false;
    } else {
      accommodationError.value = result.error || 'Failed to add accommodation';
    }
  } catch (err: any) {
    console.error('Error adding accommodation:', err);
    accommodationError.value = err.message || 'An unexpected error occurred';
  } finally {
    addingAccommodation.value = false;
  }
};

const toggleEditAccommodation = (accommodation: any) => {
  if (editingAccommodation.value && editingAccommodation.value.id === accommodation.id) {
    editingAccommodation.value = null;
  } else {
    editingAccommodation.value = {
      ...accommodation,
      address: accommodation.address || '',
      notes: accommodation.notes || '',
    };
    accommodationError.value = null;
  }
};

const handleUpdateAccommodation = async (accommodation: any) => {
  if (!editingAccommodation.value) return;
  
  updatingAccommodation.value = true;
  accommodationError.value = null;

  try {
    const accommodationData: any = {};
    
    if (editingAccommodation.value.accommodation_type !== undefined) {
      accommodationData.accommodation_type = editingAccommodation.value.accommodation_type;
    }
    if (editingAccommodation.value.name !== undefined) {
      accommodationData.name = editingAccommodation.value.name.trim();
    }
    if (editingAccommodation.value.address !== undefined) {
      accommodationData.address = editingAccommodation.value.address ? editingAccommodation.value.address.trim() : null;
    }
    if (editingAccommodation.value.notes !== undefined) {
      accommodationData.notes = editingAccommodation.value.notes ? editingAccommodation.value.notes.trim() : null;
    }

    const result = await updateEventAccommodation(eventId, accommodation.id, accommodationData);

    if (result.success && result.accommodation) {
      // Update in list
      const index = accommodations.value.findIndex(acc => acc.id === accommodation.id);
      if (index !== -1) {
        accommodations.value[index] = result.accommodation;
      }
      editingAccommodation.value = null;
    } else {
      accommodationError.value = result.error || 'Failed to update accommodation';
    }
  } catch (err: any) {
    console.error('Error updating accommodation:', err);
    accommodationError.value = err.message || 'An unexpected error occurred';
  } finally {
    updatingAccommodation.value = false;
  }
};

const toggleEditAccommodationAssignment = (member: StaffMember, accommodation: any) => {
  if (editingAccommodationAssignment.value && 
      editingAccommodationAssignment.value.accommodationId === accommodation.id && 
      editingAccommodationAssignment.value.staffId === member.id) {
    editingAccommodationAssignment.value = null;
  } else {
    editingAccommodationAssignment.value = {
      accommodationId: accommodation.id,
      staffId: member.id,
      room_number: accommodation.room_number || '',
      board_type: accommodation.board_type || 'none',
      check_in_date: accommodation.check_in_date || '',
      check_out_date: accommodation.check_out_date || '',
      notes: accommodation.assignment_notes || accommodation.notes || '',
    };
    accommodationError.value = null;
  }
};

const handleUpdateAccommodationAssignment = async (member: StaffMember, accommodation: any) => {
  if (!editingAccommodationAssignment.value) return;
  
  updatingAccommodationAssignment.value = true;
  accommodationError.value = null;

  try {
    const assignmentDetails = {
      room_number: editingAccommodationAssignment.value.room_number || null,
      board_type: editingAccommodationAssignment.value.board_type,
      check_in_date: editingAccommodationAssignment.value.check_in_date || null,
      check_out_date: editingAccommodationAssignment.value.check_out_date || null,
      notes: editingAccommodationAssignment.value.notes || null,
    };

    const result = await assignAccommodationToStaff(
      eventId,
      accommodation.id,
      member.id,
      assignmentDetails
    );

    if (result.success && result.accommodation) {
      // Update in member accommodations list
      if (memberAccommodations.value[member.id]) {
        const index = memberAccommodations.value[member.id].findIndex(
          acc => acc.id === accommodation.id
        );
        if (index !== -1) {
          memberAccommodations.value[member.id][index] = result.accommodation;
        }
      }
      editingAccommodationAssignment.value = null;
    } else {
      accommodationError.value = result.error || 'Failed to update accommodation assignment';
    }
  } catch (err: any) {
    console.error('Error updating accommodation assignment:', err);
    accommodationError.value = err.message || 'An unexpected error occurred';
  } finally {
    updatingAccommodationAssignment.value = false;
  }
};

const confirmDeleteAccommodation = (accommodation: any) => {
  if (confirm(`Are you sure you want to delete "${accommodation.name}"? This will also remove all assignments.`)) {
    handleDeleteAccommodation(accommodation);
  }
};

const handleDeleteAccommodation = async (accommodation: any) => {
  try {
    const result = await deleteEventAccommodation(eventId, accommodation.id);
    if (result.success) {
      accommodations.value = accommodations.value.filter(a => a.id !== accommodation.id);
      // Remove from all member accommodations
      for (const staffId in memberAccommodations.value) {
        memberAccommodations.value[staffId] = memberAccommodations.value[staffId].filter(
          a => a.id !== accommodation.id
        );
      }
    } else {
      alert(result.error || 'Failed to delete accommodation');
    }
  } catch (err: any) {
    console.error('Error deleting accommodation:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

const toggleAccommodationsForm = (member: StaffMember) => {
  if (showingAccommodationsForm.value === member.id) {
    showingAccommodationsForm.value = null;
    delete accommodationAssignFormData.value[member.id];
    delete accommodationAssignDetails.value[member.id];
  } else {
    showingAccommodationsForm.value = member.id;
    accommodationAssignFormData.value[member.id] = '';
    // Initialize or load existing assignment details
    const existingAcc = memberAccommodations.value[member.id]?.find(
      acc => acc.id === accommodationAssignFormData.value[member.id]
    );
    if (existingAcc) {
      accommodationAssignDetails.value[member.id] = {
        room_number: existingAcc.room_number || '',
        board_type: existingAcc.board_type || 'none',
        check_in_date: existingAcc.check_in_date || '',
        check_out_date: existingAcc.check_out_date || '',
        notes: existingAcc.assignment_notes || '',
      };
    } else {
      accommodationAssignDetails.value[member.id] = {
        room_number: '',
        board_type: 'none',
        check_in_date: '',
        check_out_date: '',
        notes: '',
      };
    }
  }
  accommodationError.value = null;
};

const onAccommodationSelected = (member: StaffMember) => {
  const accId = accommodationAssignFormData.value[member.id];
  if (!accId) {
    delete accommodationAssignDetails.value[member.id];
    return;
  }
  
  // Check if this person already has this accommodation assigned
  const existingAcc = memberAccommodations.value[member.id]?.find(acc => acc.id === accId);
  if (existingAcc) {
    accommodationAssignDetails.value[member.id] = {
      room_number: existingAcc.room_number || '',
      board_type: existingAcc.board_type || 'none',
      check_in_date: existingAcc.check_in_date || '',
      check_out_date: existingAcc.check_out_date || '',
      notes: existingAcc.assignment_notes || '',
    };
  } else {
    accommodationAssignDetails.value[member.id] = {
      room_number: '',
      board_type: 'none',
      check_in_date: '',
      check_out_date: '',
      notes: '',
    };
  }
};

const selectedAccommodationType = (member: StaffMember): string => {
  const accId = accommodationAssignFormData.value[member.id];
  if (!accId) return '';
  const acc = accommodations.value.find(a => a.id === accId);
  return acc?.accommodation_type || '';
};

const existingAssignment = (member: StaffMember): boolean => {
  const accId = accommodationAssignFormData.value[member.id];
  if (!accId) return false;
  return memberAccommodations.value[member.id]?.some(acc => acc.id === accId) || false;
};

const handleAssignAccommodation = async (member: StaffMember) => {
  accommodationError.value = null;
  assigningAccommodation.value = true;
  
  try {
    const accId = accommodationAssignFormData.value[member.id];
    if (!accId) {
      accommodationError.value = 'Please select an accommodation';
      assigningAccommodation.value = false;
      return;
    }

    const assignmentDetails = accommodationAssignDetails.value[member.id] ? {
      room_number: accommodationAssignDetails.value[member.id].room_number || null,
      board_type: accommodationAssignDetails.value[member.id].board_type || 'none',
      check_in_date: accommodationAssignDetails.value[member.id].check_in_date || null,
      check_out_date: accommodationAssignDetails.value[member.id].check_out_date || null,
      notes: accommodationAssignDetails.value[member.id].notes || null,
    } : undefined;

    const result = await assignAccommodationToStaff(eventId, accId, member.id, assignmentDetails);

    if (result.success && result.accommodation) {
      // Reload accommodations for this member
      await loadAccommodationsForMember(member.id);
      // Reload all accommodations to update assignment info
      await loadAccommodations();
      delete accommodationAssignFormData.value[member.id];
      delete accommodationAssignDetails.value[member.id];
      showingAccommodationsForm.value = null;
    } else {
      accommodationError.value = result.error || 'Failed to assign accommodation';
    }
  } catch (err: any) {
    console.error('Error assigning accommodation:', err);
    accommodationError.value = err.data?.message || err.message || 'An unexpected error occurred';
  } finally {
    assigningAccommodation.value = false;
  }
};

const confirmUnassignAccommodation = (member: StaffMember, accommodation: any) => {
  if (confirm(`Are you sure you want to remove "${accommodation.name}" from ${member.name}?`)) {
    handleUnassignAccommodation(member, accommodation);
  }
};

const handleUnassignAccommodation = async (member: StaffMember, accommodation: any) => {
  try {
    const result = await unassignAccommodationFromStaff(
      eventId,
      accommodation.id,
      member.id
    );
    if (result.success) {
      // Reload accommodations for this member
      await loadAccommodationsForMember(member.id);
      // Reload all accommodations to update assignment info
      await loadAccommodations();
    } else {
      alert(result.error || 'Failed to unassign accommodation');
    }
  } catch (err: any) {
    console.error('Error unassigning accommodation:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

</script>

