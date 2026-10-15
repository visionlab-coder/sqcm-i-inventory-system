const MIN_PASSWORD_LENGTH = 10;
const PASSWORD_POLICY_MESSAGE = '비밀번호는 10자 이상이며 영문·숫자·특수문자를 포함해야 합니다.';

function validateStrongPassword(password) {
  const value = String(password || '');
  return value.length >= MIN_PASSWORD_LENGTH
    && /[A-Za-z]/.test(value)
    && /\d/.test(value)
    && /[\p{P}\p{S}]/u.test(value);
}

module.exports = { MIN_PASSWORD_LENGTH, PASSWORD_POLICY_MESSAGE, validateStrongPassword };
