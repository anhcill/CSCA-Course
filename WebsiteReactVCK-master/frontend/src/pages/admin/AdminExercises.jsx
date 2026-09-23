import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import useGetExercises from '../../hooks/useGetExercises';
import useGetAllLessons from '../../hooks/useGetAllLessson';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { marked } from 'marked';
import Loading from '../../components/Loading';
import Error from '../../components/Error';
import { useTranslation } from 'react-i18next';

const AdminExercises = () => {
  const { t } = useTranslation();
  const { lessonId } = useParams();
  const location = useLocation();
  const lessonIndex = location.state?.index;
  const { lessons } = useGetAllLessons();
  const { exercises, loading, error } = useGetExercises(lessonId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [formData, setFormData] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: ''
  });


  const handleDelete = async (exerciseId) => {
    if (window.confirm(t('adminExercises_deleteConfirmation'))) {
      try {
        await axios.delete(`/api/exercise/${exerciseId}`);
        toast.success(t('adminExercises_deleteSuccess'));
        window.location.reload();
      } catch {
        toast.error(t('adminExercises_deleteError'));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const exerciseData = {
        ...formData,
        lessonId,
        options: formData.options.filter(option => option.trim() !== '')
      };

      if (editingExercise) {
        await axios.put(`/api/exercise/${editingExercise._id}`, exerciseData);
        toast.success(t('adminExercises_updateSuccess'));
      } else {
        await axios.post('/api/exercise', exerciseData);
        toast.success(t('adminExercises_createSuccess'));
      }
      setIsModalOpen(false);
      window.location.reload();
    } catch {
      toast.error(t('common_errorPrefix'));
    }
  };

  if (loading) return <Loading loading={loading} text="Đang tải bài tập..." />;
  if (error) return <Error error={error} />;

  const courseId = lessons.filter(l => l._id === lessonId)?.[0]?.courseId;


  return (
    <div className="space-y-6 font-sans pb-16">
      <Link
        to={`/admin/courses/${courseId}/lessons`}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
      >
        <FiArrowLeft className="w-4 h-4" />
        <span>{t('adminExercises_backToLessons')}</span>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            {t('adminExercises_title')}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {t('adminExercises_lessonNumber')}: <strong className="text-gray-900 dark:text-white">{lessonIndex + 1}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              {t('adminExercises_exerciseCount')}: <strong className="text-gray-900 dark:text-white">{exercises.length}</strong>
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingExercise(null);
            setFormData({
              question: '',
              options: ['', '', '', ''],
              correctAnswer: ''
            });
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/30"
        >
          <FiPlus className="w-4 h-4" />
          <span>{t('adminExercises_addExerciseButton')}</span>
        </button>
      </div>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminExercises_tableHeader_question')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminExercises_tableHeader_options')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminExercises_tableHeader_correctAnswer')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminExercises_tableHeader_actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {exercises.map((exercise) => (
                <tr key={exercise._id}>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {exercise.question}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-300">
                      <ul className="list-disc ">
                        {exercise.options.map((option, index) => (
                          <li key={index} dangerouslySetInnerHTML={{ __html: marked.parse(option) }}></li>
                        ))}
                      </ul>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium" dangerouslySetInnerHTML={{ __html: marked.parse(exercise.correctAnswer) }}></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setEditingExercise(exercise);
                        setFormData({
                          question: exercise.question,
                          options: [...exercise.options, ...Array(4 - exercise.options.length).fill('')],
                          correctAnswer: exercise.correctAnswer
                        });
                        setIsModalOpen(true);
                      }}
                      title={t('adminExercises_actions_editExerciseTitle')}
                      className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 bg-gray-100 dark:bg-gray-700 hover:text-blue-900 dark:hover:bg-gray-600 mr-2 transition"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(exercise._id)}
                      title={t('adminExercises_actions_deleteExerciseTitle')}
                      className="p-1.5 rounded-lg text-red-600 dark:text-red-400 bg-gray-100 dark:bg-gray-700 hover:text-red-900 dark:hover:bg-gray-600 transition"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Form */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 w-full max-w-md shadow-2xl transform transition-all duration-300 ease-out scale-100 hover:scale-[1.02]">
              <h2 className="text-2xl font-bold mb-6 dark:text-white bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                {editingExercise ? t('adminExercises_modal_editTitle') : t('adminExercises_modal_addTitle')}
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {t('adminExercises_form_questionLabel')}
                    </label>
                    <input
                      type="text"
                      value={formData.question}
                      onChange={(e) =>
                        setFormData({ ...formData, question: e.target.value })
                      }
                      className="mt-1 block w-full rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border border-gray-200 dark:border-gray-600 px-4 py-3 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 focus:outline-none transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      {t('adminExercises_form_optionsLabel')}
                    </label>
                    {formData.options.map((option, index) => (
                      <div key={index} className="mb-3">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...formData.options];
                            newOptions[index] = e.target.value;
                            setFormData({ ...formData, options: newOptions });
                          }}
                          placeholder={t('adminExercises_form_optionPlaceholder', { number: index + 1 })}
                          className="mt-1 block w-full rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border border-gray-200 dark:border-gray-600 px-4 py-3 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 focus:outline-none transition-all duration-200"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {t('adminExercises_form_correctAnswerLabel')}
                    </label>
                    <select
                      value={formData.correctAnswer}
                      onChange={(e) =>
                        setFormData({ ...formData, correctAnswer: e.target.value })
                      }
                      className="mt-1 block w-full rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border border-gray-200 dark:border-gray-600 px-4 py-3 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 focus:outline-none transition-all duration-200"
                      required
                    >
                      <option value="" className="py-2">{t('adminExercises_form_correctAnswerOption')}</option>
                      {formData.options
                        .filter(option => option.trim() !== '')
                        .map((option, index) => (
                          <option key={index} value={option} className="py-2">
                            {option}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="mt-8 flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200 dark:text-white dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-all duration-200"
                  >
                    {t('common_cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/30 transition-all duration-200"
                  >
                    {editingExercise ? t('common_update') : t('common_addNew')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
};

export default AdminExercises;