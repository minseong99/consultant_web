// 문자 길이. 서버(API)와 화면이 함께 쓴다.

/** 한 번에 보낼 수 있는 글자 수. 게이트웨이(web/message-send)의 한도와 같다. */
export const MESSAGE_MAX_LENGTH = 1000;

/** 단문(SMS)으로 나가는 한도. 넘으면 장문(LMS)이 된다. 한글 한 글자는 2바이트다. */
export const SMS_BYTES = 90;

/** 문자 길이를 통신사 기준 바이트로 센다 (한글·한자·전각 2바이트, 그 밖 1바이트). */
export function messageBytes(text: string) {
  let bytes = 0;
  for (const char of text) bytes += char.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}
