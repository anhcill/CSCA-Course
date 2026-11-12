import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const bindPoolToDb = (pool, db) => {
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
};

test("admin learning unit content API: vocabulary, formulas, assignments, quizzes, and file placements", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const bunnyRouter = (await import("./bunnyVideo.router.js")).default;

  // Insert Admin User & Course
  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('admin-unit','admin-unit@example.test','admin') RETURNING id",
  )).rows[0];

  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('HSK Independent Full Unit','hsk-ind-full-unit',$1,TRUE,TRUE) RETURNING id`,
    [admin.id],
  )).rows[0];

  const section = (await db.query(
    `INSERT INTO sections(course_id,title,sort_order) VALUES ($1,'Chương 1',0) RETURNING id`,
    [course.id],
  )).rows[0];

  const lesson = (await db.query(
    `INSERT INTO lessons(section_id,course_id,name,title,duration_seconds,sort_order)
     VALUES ($1,$2,'Bai 1','Bài 1: Khởi động phát âm',1200,0) RETURNING id`,
    [section.id, course.id],
  )).rows[0];

  // Helper to execute route handler
  const callRoute = async (method, pathPattern, req) => {
    const layer = bunnyRouter.stack.find((l) => (
      l.route?.path === pathPattern && l.route.methods[method.toLowerCase()]
    ));
    assert.ok(layer, `Route not found for ${method} ${pathPattern}`);
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() { return this; },
    };
    await layer.route.stack.at(-1).handle(
      {
        user: { id: admin.id, role: "admin" },
        query: {},
        body: {},
        params: {},
        ...req,
      },
      res,
      (err) => { if (err) throw err; },
    );
    return res;
  };

  // 1. GET /admin/learning-units/:unitId/content - initially empty
  const initialContentRes = await callRoute("GET", "/admin/learning-units/:unitId/content", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
  });
  assert.equal(initialContentRes.statusCode, 200);
  assert.equal(initialContentRes.body.success, true);
  assert.deepEqual(initialContentRes.body.data.vocabulary, []);
  assert.deepEqual(initialContentRes.body.data.formulas, []);
  assert.deepEqual(initialContentRes.body.data.files, []);
  assert.deepEqual(initialContentRes.body.data.assignments, []);
  assert.deepEqual(initialContentRes.body.data.quizzes, []);

  // 2. POST /admin/learning-units/:unitId/vocabulary/batch
  const batchVocabRes = await callRoute("POST", "/admin/learning-units/:unitId/vocabulary/batch", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    body: {
      items: [
        { term: "你好", pinyin: "nǐ hǎo", sinoVietnamese: "Nễ hảo", meaning: "Xin chào", example: "你好吗？" },
        { term: "谢谢", pinyin: "xièxie", sinoVietnamese: "Tạ tạ", meaning: "Cảm ơn", example: "谢谢老师。" },
      ],
    },
  });
  assert.equal(batchVocabRes.statusCode, 201);
  assert.equal(batchVocabRes.body.success, true);
  assert.equal(batchVocabRes.body.data.length, 2);

  // Verify vocabulary in db
  const vocabInDb = (await db.query("SELECT * FROM session_vocabularies WHERE lesson_id = $1 ORDER BY id", [lesson.id])).rows;
  assert.equal(vocabInDb.length, 2);
  assert.equal(vocabInDb[0].term, "你好");

  // 3. PUT /admin/learning-units/:unitId/vocabulary/:vocabId
  const updateVocabRes = await callRoute("PUT", "/admin/learning-units/:unitId/vocabulary/:vocabId", {
    params: { unitId: String(lesson.id), vocabId: String(vocabInDb[0].id) },
    body: {
      term: "你好！",
      pinyin: "nǐ hǎo!",
      meaning: "Xin chào bạn!",
    },
  });
  assert.equal(updateVocabRes.statusCode, 200);
  assert.equal(updateVocabRes.body.data.term, "你好！");

  // 4. DELETE /admin/learning-units/:unitId/vocabulary/:vocabId
  const deleteVocabRes = await callRoute("DELETE", "/admin/learning-units/:unitId/vocabulary/:vocabId", {
    params: { unitId: String(lesson.id), vocabId: String(vocabInDb[1].id) },
  });
  assert.equal(deleteVocabRes.statusCode, 200);
  const remainingVocab = (await db.query("SELECT * FROM session_vocabularies WHERE lesson_id = $1", [lesson.id])).rows;
  assert.equal(remainingVocab.length, 1);

  // 5. Formulas: test POST /admin/learning-units/:unitId/formulas, PUT, and DELETE
  const createFormulaRes = await callRoute("POST", "/admin/learning-units/:unitId/formulas", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    body: {
      subject: "MATH",
      chapterName: "Đại số & Giải tích",
      nameVi: "Phương trình bậc 2",
      latex: "ax^2 + bx + c = 0",
      description: "Công thức nghiệm",
    },
  });
  assert.equal(createFormulaRes.statusCode, 201);
  assert.equal(createFormulaRes.body.success, true);
  const createdFormulaId = createFormulaRes.body.data.id;

  const updateFormulaRes = await callRoute("PUT", "/admin/learning-units/:unitId/formulas/:formulaId", {
    params: { unitId: String(lesson.id), formulaId: String(createdFormulaId) },
    body: {
      nameVi: "Định lý Pytago",
      latex: "a^2 + b^2 = c^2",
      description: "Tam giác vuông",
    },
  });
  assert.equal(updateFormulaRes.statusCode, 200);
  assert.equal(updateFormulaRes.body.data.name_vi, "Định lý Pytago");

  const deleteFormulaRes = await callRoute("DELETE", "/admin/learning-units/:unitId/formulas/:formulaId", {
    params: { unitId: String(lesson.id), formulaId: String(createdFormulaId) },
  });
  assert.equal(deleteFormulaRes.statusCode, 200);
  const remainingFormulas = (await db.query("SELECT * FROM session_formulas WHERE lesson_id = $1", [lesson.id])).rows;
  assert.equal(remainingFormulas.length, 0);

  // 6. POST /admin/learning-units/:unitId/assignments - create homework
  const createAssignRes = await callRoute("POST", "/admin/learning-units/:unitId/assignments", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    body: {
      courseId: course.id,
      title: "Bài tập dịch đoạn văn HSK",
      description: "Dịch các câu sau sang tiếng Trung",
      assignmentType: "ESSAY",
      maxScore: 10,
      rubric: [
        { criterion: "Đúng ngữ pháp", points: 5 },
        { criterion: "Dùng từ chính xác", points: 5 },
      ],
    },
  });
  assert.equal(createAssignRes.statusCode, 201);
  assert.equal(createAssignRes.body.success, true);
  const createdAssignId = createAssignRes.body.data.id;

  // 7. POST /admin/learning-units/:unitId/quizzes - create multiple-choice quiz
  const createQuizRes = await callRoute("POST", "/admin/learning-units/:unitId/quizzes", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    body: {
      courseId: course.id,
      title: "Quiz kiểm tra thanh mẫu",
      durationMinutes: 15,
      passPercentage: 80,
      questions: [
        {
          questionText: "Âm 'b' trong Pinyin đọc tương đương âm nào trong tiếng Việt?",
          questionType: "MULTIPLE_CHOICE",
          points: 1,
          options: [
            { text: "p", isCorrect: true },
            { text: "b", isCorrect: false },
            { text: "m", isCorrect: false },
            { text: "f", isCorrect: false },
          ],
        },
      ],
    },
  });
  assert.equal(createQuizRes.statusCode, 201);
  assert.equal(createQuizRes.body.success, true);
  const createdQuizId = createQuizRes.body.data.id;

  // 8. Reusable files & Detach
  const file1 = (await db.query(
    `INSERT INTO lms_learning_files
       (course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,status)
     VALUES ($1,$2,'slide-bai-1.pptx','learning-files/slide1.pptx','application/vnd.ms-powerpoint',2048,'ready')
     RETURNING id`,
    [course.id, admin.id],
  )).rows[0];

  // Confirm placement
  const confirmFileRes = await callRoute("POST", "/admin/learning-units/:unitId/files/confirm", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    body: { fileId: file1.id },
  });
  assert.equal(confirmFileRes.statusCode, 200);

  // Check GET content bundle returns all attached items
  const fullContentRes = await callRoute("GET", "/admin/learning-units/:unitId/content", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
  });
  assert.equal(fullContentRes.statusCode, 200);
  assert.equal(fullContentRes.body.data.vocabulary.length, 1);
  assert.equal(fullContentRes.body.data.assignments.length, 1);
  assert.equal(fullContentRes.body.data.quizzes.length, 1);
  assert.equal(fullContentRes.body.data.files.length, 1);
  assert.equal(fullContentRes.body.data.files[0].originalName, "slide-bai-1.pptx");

  // 9. Detach file, delete assignment & quiz
  const detachRes = await callRoute("DELETE", "/admin/learning-units/:unitId/files/:fileId", {
    params: { unitId: String(lesson.id), fileId: String(file1.id) },
    query: { unitType: "lesson" },
  });
  assert.equal(detachRes.statusCode, 200);

  const deleteAssignRes = await callRoute("DELETE", "/admin/learning-units/:unitId/assignments/:assignmentId", {
    params: { unitId: String(lesson.id), assignmentId: String(createdAssignId) },
  });
  assert.equal(deleteAssignRes.statusCode, 200);

  const deleteQuizRes = await callRoute("DELETE", "/admin/learning-units/:unitId/quizzes/:quizId", {
    params: { unitId: String(lesson.id), quizId: String(createdQuizId) },
  });
  assert.equal(deleteQuizRes.statusCode, 200);

  // Verify all cleaned up
  const endContentRes = await callRoute("GET", "/admin/learning-units/:unitId/content", {
    params: { unitId: String(lesson.id) },
    query: { unitType: "lesson" },
  });
  assert.equal(endContentRes.body.data.assignments.length, 0);
  assert.equal(endContentRes.body.data.quizzes.length, 0);
  assert.equal(endContentRes.body.data.files.length, 0);
});
