/** 접었다 펴는 설명 블록 (아코디언).
 *
 * 네이티브 <details>를 쓴다. 자바스크립트 없이 열리고, 스크린리더가 열림/닫힘을
 * 읽어 주고, 브라우저 찾기(Ctrl+F)에도 걸린다. 직접 만든 토글은 셋 다 잃는다.
 *
 * 쓰임새: 평소엔 안 보여도 되지만 누가 물으면 바로 답이 나와야 하는 내용.
 * 대시보드의 "자료에 대한 질문"이 그렇다 — 근거를 화면에 늘어놓으면 아무도
 * 안 읽고, 감춰 두면 물었을 때 답이 없다.
 */
import type { ReactNode } from "react";

export interface DisclosureProps {
  /** 접힌 상태에서 보이는 한 줄 — 질문 형태로 쓴다 */
  question: string;
  children: ReactNode;
  /** 처음부터 펼쳐 둘 것인가 */
  defaultOpen?: boolean;
}

export function Disclosure({ question, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details className="faq" open={defaultOpen}>
      <summary>{question}</summary>
      <div className="faq-body">{children}</div>
    </details>
  );
}
