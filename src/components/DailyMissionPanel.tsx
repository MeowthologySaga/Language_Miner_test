import { CheckCircle2, Gem, Gift } from "lucide-react";
import { normalizeDailyMissionBoard } from "../shared/dailyMissions";
import type {
  DailyMissionBoard,
  DailyMissionCategory,
  DailyMissionId,
  DailyMissionStatus,
  DiamondWallet
} from "../shared/types";

type DailyMissionPanelProps = {
  missionBoard: DailyMissionBoard;
  wallet: DiamondWallet;
  onClaimMission: (missionId: DailyMissionId) => Promise<void>;
  onClaimDailyBonus: () => Promise<void>;
};

type MissionCardProps = {
  mission: DailyMissionStatus;
  onClaim: () => Promise<void>;
};

const dailyMissionCategoryOrder: DailyMissionCategory[] = ["input", "output", "review"];

const dailyMissionCategoryLabels: Record<DailyMissionCategory, string> = {
  input: "인풋",
  output: "아웃풋",
  review: "복습"
};

export function DailyMissionPanel({
  missionBoard,
  wallet,
  onClaimMission,
  onClaimDailyBonus
}: DailyMissionPanelProps) {
  const normalizedMissionBoard = normalizeDailyMissionBoard(missionBoard);
  const missionGroups = getDailyMissionGroups(normalizedMissionBoard.missions);

  return (
    <section className="daily-mission-panel">
      <div className="daily-mission-header">
        <div>
          <span className="daily-mission-eyebrow">일일 퀘스트</span>
          <h2>오늘의 미션</h2>
          <p>핵심 학습을 완료하고 다이아를 받아두세요.</p>
        </div>
        <div className="diamond-wallet-card">
          <Gem size={22} />
          <span>
            <strong>{formatInteger(wallet.balance)}</strong>
            <small>다이아 · 오늘 +{formatInteger(normalizedMissionBoard.earnedToday)}</small>
          </span>
        </div>
      </div>
      <div className="daily-mission-category-list">
        {missionGroups.map((group) => (
          <section className="daily-mission-category" key={group.category}>
            <div className="daily-mission-category-head">
              <span>{dailyMissionCategoryLabels[group.category]}</span>
              <small>
                {group.claimedCount} / {group.totalCount}
              </small>
            </div>
            <div className="daily-mission-grid">
              {group.missions.length > 0 ? (
                group.missions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    onClaim={() => onClaimMission(mission.id)}
                  />
                ))
              ) : (
                <div className="mission-empty-card">
                  <strong>{dailyMissionCategoryLabels[group.category]} 미션 없음</strong>
                  <small>이 범주의 오늘 미션이 아직 없습니다.</small>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className={getDailyBonusCardClassName(normalizedMissionBoard.bonus)}>
        <div>
          <Gift size={20} />
          <span>
            <strong>{normalizedMissionBoard.bonus.title}</strong>
            <small>{normalizedMissionBoard.bonus.description}</small>
          </span>
        </div>
        <div className="daily-bonus-side">
          <span className="mission-reward">
            <Gem size={14} />
            {normalizedMissionBoard.bonus.rewardDiamonds}
          </span>
          <button
            className="button primary small"
            disabled={!normalizedMissionBoard.bonus.claimable}
            type="button"
            onClick={() => void onClaimDailyBonus()}
          >
            {getDailyBonusButtonLabel(normalizedMissionBoard.bonus)}
          </button>
        </div>
      </div>
    </section>
  );
}

function getDailyMissionGroups(missions: DailyMissionStatus[]) {
  return dailyMissionCategoryOrder.map((category) => {
    const categoryMissions = missions.filter((mission) => mission.category === category);
    return {
      category,
      missions: categoryMissions,
      totalCount: categoryMissions.length,
      claimedCount: categoryMissions.filter((mission) => mission.claimed).length
    };
  });
}

function MissionCard({ mission, onClaim }: MissionCardProps) {
  const progressPercent = Math.min(100, Math.round((mission.progress / mission.goal) * 100));
  return (
    <article className={mission.claimed ? "mission-card claimed" : "mission-card"}>
      <div className="mission-card-head">
        <span className="mission-icon">
          {mission.claimed ? <CheckCircle2 size={18} /> : <Gem size={18} />}
        </span>
        <span>
          <strong>{mission.title}</strong>
          <small>{mission.description}</small>
        </span>
      </div>
      <div className="mission-progress-row">
        <span>
          {mission.progress} / {mission.goal}
        </span>
        <span className="mission-reward">
          <Gem size={14} />
          {mission.rewardDiamonds}
        </span>
      </div>
      <span className="mission-progress-track" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </span>
      <button
        className="button primary small"
        disabled={!mission.claimable}
        type="button"
        onClick={() => void onClaim()}
      >
        {mission.claimed ? "완료" : mission.claimable ? "받기" : "진행 중"}
      </button>
    </article>
  );
}

function getDailyBonusCardClassName(bonus: DailyMissionBoard["bonus"]) {
  if (bonus.claimed) {
    return "daily-bonus-card claimed";
  }
  if (bonus.claimable) {
    return "daily-bonus-card claimable";
  }
  return "daily-bonus-card locked";
}

function getDailyBonusButtonLabel(bonus: DailyMissionBoard["bonus"]) {
  if (bonus.claimed) {
    return "완료";
  }
  if (bonus.claimable) {
    return "받기";
  }
  return "잠김";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}
