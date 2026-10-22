import { useAuthContext } from '../context/AuthContext';

const useForgotPassword = () => {
  const { requestPasswordReset } = useAuthContext();

  const forgotPassword = async (email) => {
    const result = await requestPasswordReset(email);
    return { success: true, data: result };
  };

  return { forgotPassword };
};

export default useForgotPassword;
