(function attachReturnDraftRecovery(global) {
  function canResume(row, userId, ownRows = false) {
    return row?.request_type === 'RETURN' && row.status === 'DRAFT'
      && (ownRows || String(row.requester_id) === String(userId));
  }
  function create({ requestId, upload, submit, isCurrent = () => true }) {
    const id = Number(requestId);
    if (!/^[1-9]\d*$/.test(String(requestId)) || !Number.isSafeInteger(id)) throw new Error('올바른 반납 초안 번호가 필요합니다.');
    let pending = null, uploaded = false, submitted = false;
    const current = () => { if (!isCurrent()) throw Object.assign(new Error('계정이 변경됐습니다. 요청을 다시 확인하세요.'), { code: 'SESSION_CHANGED' }); };
    return Object.freeze({
      get busy() { return !!pending; },
      get uploaded() { return uploaded; },
      run(file) {
        if (pending) return pending;
        const operation = (async () => {
          current();
          if (submitted) throw new Error('이미 제출한 반납 요청입니다.');
          if (!uploaded) {
            if (!file || !['image/jpeg', 'image/png'].includes(file.type) || !Number.isFinite(file.size) || file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('5 MiB 이하의 JPEG 또는 PNG 반납 사진을 선택하세요.');
            await upload(`/api/enterprise/requests/${id}/return-photo`, file);
            uploaded = true;
          }
          current();
          const result = await submit(`/api/enterprise/requests/${id}/action`, { method: 'POST', body: { action: 'SUBMIT' } });
          current(); submitted = true; return result;
        })();
        pending = operation.finally(() => { pending = null; });
        return pending;
      }
    });
  }
  global.ReturnDraftRecovery = Object.freeze({ canResume, create });
})(globalThis);
