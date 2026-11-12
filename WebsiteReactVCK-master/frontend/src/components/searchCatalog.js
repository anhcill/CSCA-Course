const cleanText = (value) => String(value || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

export const normalizeSearchText = (value) => cleanText(value)
  .toLocaleLowerCase("vi-VN")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d");

const matchesQuery = (item, query) => normalizeSearchText([
  item.title,
  item.description,
  item.category,
  item.level,
  item.instructorName,
].filter(Boolean).join(" ")).includes(query);

const scoreResult = (item, query) => {
  const title = normalizeSearchText(item.title);
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  return 3;
};

export const buildCourseSearchResults = ({ courses = [], offerings = [], query = "", limit = 8 } = {}) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const videoCourseIds = new Set(
    offerings.map((offering) => String(offering?.id || offering?.courseId || "")).filter(Boolean),
  );

  const recordResults = offerings
    .filter((offering) => offering?.offeringId)
    .map((offering) => ({
      key: `record:${offering.offeringId}`,
      kind: "record",
      id: String(offering.id || offering.courseId || offering.offeringId),
      offeringId: String(offering.offeringId),
      title: cleanText(offering.title || offering.name) || "Khóa học Record",
      description: cleanText(offering.description),
      category: cleanText(offering.category),
      level: cleanText(offering.level),
      instructorName: cleanText(offering.instructorName),
      thumbnailUrl: offering.thumbnailUrl || null,
      href: `/video-courses/${encodeURIComponent(offering.offeringId)}`,
    }))
    .filter((item) => matchesQuery(item, normalizedQuery));

  const publicResults = courses
    .filter((course) => {
      const courseId = String(course?.id || course?._id || "");
      return courseId && !videoCourseIds.has(courseId);
    })
    .map((course) => {
      const id = String(course.id || course._id);
      return {
        key: `course:${id}`,
        kind: "course",
        id,
        title: cleanText(course.title || course.name || course.nameCourse) || "Khóa học",
        description: cleanText(course.description),
        category: cleanText(course.category),
        level: cleanText(course.level),
        instructorName: cleanText(course.instructor_name || course.instructorName || course.authorName),
        thumbnailUrl: course.thumbnail_url || course.thumbnailUrl || course.image_url || course.imageCourse || null,
        href: `/detail-course/${encodeURIComponent(id)}`,
      };
    })
    .filter((item) => matchesQuery(item, normalizedQuery));

  return [...recordResults, ...publicResults]
    .sort((left, right) => {
      const scoreDelta = scoreResult(left, normalizedQuery) - scoreResult(right, normalizedQuery);
      if (scoreDelta !== 0) return scoreDelta;
      if (left.kind !== right.kind) return left.kind === "record" ? -1 : 1;
      return left.title.localeCompare(right.title, "vi");
    })
    .slice(0, Math.max(1, limit));
};
