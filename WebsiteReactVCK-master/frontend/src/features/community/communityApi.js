import axios from 'axios';

const api = axios.create({
  baseURL: '/api/posts',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchCommunityPosts = async (params = {}) => {
  try {
    const res = await api.get('/', { params });
    if (res.data?.success && Array.isArray(res.data?.data)) {
      return res.data.data;
    }
    return null;
  } catch (err) {
    console.warn('Backend /api/posts offline or error, falling back:', err.message);
    return null;
  }
};

export const fetchCommunityPostById = async (id) => {
  try {
    const res = await api.get(`/${id}`);
    if (res.data?.success && res.data?.data) {
      return res.data.data;
    }
    return null;
  } catch (err) {
    console.warn(`Backend /api/posts/${id} error:`, err.message);
    return null;
  }
};

export const createCommunityPost = async (postData) => {
  const res = await api.post('/', postData);
  return res.data?.data;
};

export const toggleLikeCommunityPost = async (postId) => {
  const res = await api.post(`/${postId}/like`);
  return res.data?.data; // { liked, likesCount }
};

export const addCommentToCommunityPost = async (postId, content) => {
  const res = await api.post(`/${postId}/comments`, { content });
  return res.data?.data; // newComment
};

export const toggleBookmarkCommunityPost = async (postId) => {
  const res = await api.post(`/${postId}/bookmark`);
  return res.data?.data; // { bookmarked }
};

export const deleteCommunityPostApi = async (postId) => {
  const res = await api.delete(`/${postId}`);
  return res.data;
};
