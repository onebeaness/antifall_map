"use client";

/** 로그인 · 간편 등록 (IA.md 2.2, 정본: 로그인 화면.dc.html).
 * 이름·생년월일(확인)·성별·최근 1년 낙상 경험(ML Model B 게이트)을 수집한다. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, OptionButton, TextField } from "@/components/ui";
import { storage } from "@/lib/storage";
import type { Gender } from "@/lib/types";

function validBirth(b: string): boolean {
  if (!/^\d{8}$/.test(b)) return false;
  const y = Number(b.slice(0, 4));
  const m = Number(b.slice(4, 6));
  const d = Number(b.slice(6, 8));
  return y >= 1900 && y <= new Date().getFullYear() && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

const BULLETS: [string, string][] = [
  ["var(--good)", "간단·정밀 낙상 위험 자가진단"],
  ["var(--warn)", "신호등 3단계 등급 · 맞춤 예방 가이드"],
  ["var(--danger)", "집 주변 경사도 히트맵 안전 경로"],
];

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [birth2, setBirth2] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [fall, setFall] = useState<"Y" | "N" | "">("");

  const bOk = validBirth(birth);
  const match = bOk && birth === birth2;
  const can = name.trim().length > 0 && match && gender !== "" && fall !== "";

  const submit = async () => {
    if (!can) return;
    await storage.saveProfile({
      name: name.trim(),
      birth,
      gender: gender as Gender,
      fallExperience: fall === "Y",
    });
    router.push("/me");
  };

  return (
    <main className="container">
      <div className="register-grid">
        {/* 좌: 브랜드 패널 */}
        <Card variant="panel" style={{ padding: "44px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.14)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800,
            }}>안</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>안심걸음</div>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.6px", margin: "0 0 18px" }}>
            낙상 위험 예측 서비스에<br />오신 것을 환영합니다
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.75, color: "#cfd6ee", margin: "0 0 22px" }}>
            간단한 정보만 등록하면 나의 낙상 위험도를 진단하고, 맞춤 예방 안내와
            안전한 보행 경로까지 한곳에서 확인할 수 있습니다.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {BULLETS.map(([color, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 15.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "none" }} />
                {text}
              </div>
            ))}
          </div>
        </Card>

        {/* 우: 등록 폼 */}
        <Card style={{ borderRadius: 20, padding: 34 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>
            개인 정보 등록
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "6px 0 18px" }}>
            진단을 위해 정보를 등록해 주세요
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <TextField label="이름" placeholder="예) 김순자" value={name}
                       onChange={(e) => setName(e.target.value)} />
            <TextField label="생년월일" placeholder="8자리 숫자 (예: 19430507)" inputMode="numeric"
                       maxLength={8} value={birth}
                       onChange={(e) => setBirth(e.target.value.replace(/\D/g, ""))} />
            <TextField label="생년월일 확인" placeholder="생년월일을 한 번 더 입력해 주세요"
                       inputMode="numeric" maxLength={8} value={birth2}
                       onChange={(e) => setBirth2(e.target.value.replace(/\D/g, ""))}
                       status={birth2 && birth !== birth2 ? "error" : match ? "success" : undefined}
                       message={birth2 && birth !== birth2 ? "생년월일이 일치하지 않습니다."
                         : match ? "확인되었습니다." : undefined} />

            <div>
              <div style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>성별</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <OptionButton selected={gender === "M"} onClick={() => setGender("M")}>남성</OptionButton>
                <OptionButton selected={gender === "F"} onClick={() => setGender("F")}>여성</OptionButton>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>
                최근 1년간 넘어진(낙상) 적이 있으신가요?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <OptionButton selected={fall === "Y"} onClick={() => setFall("Y")}>예, 있습니다</OptionButton>
                <OptionButton selected={fall === "N"} onClick={() => setFall("N")}>아니오, 없습니다</OptionButton>
              </div>
            </div>

            <Button fullWidth disabled={!can} onClick={submit}>등록하고 시작하기 →</Button>
            <Button variant="ghost" fullWidth onClick={() => router.push("/")}>← 처음 화면으로</Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
