export type ListeningLoopSegment = {
  id: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
  translationKo: string;
  noteKo?: string;
  sourceVideoId?: string;
  sourceTitle?: string;
  sourceChannelName?: string;
  sourceLanguageCode?: string;
  routineClipId?: string;
  routineClipIndex?: number;
  routineClipStart?: number;
  routineClipEnd?: number;
};

export type ListeningLoopSeed = {
  id: string;
  title: string;
  channelName: string;
  videoId: string;
  languageCode?: string;
  levelLabel: string;
  topicLabel: string;
  recommendedReason: string;
  segments: ListeningLoopSegment[];
};

export const listeningLoopSeeds: ListeningLoopSeed[] = [
  {
    id: "youtube-player-demo-short",
    title: "Short everyday English loop sample",
    channelName: "YouTube sample",
    videoId: "M7lc1UVf-VE",
    languageCode: "en",
    levelLabel: "A2-B1",
    topicLabel: "일상 표현",
    recommendedReason: "짧은 구간으로 듣기 루프 UI를 테스트하기 좋은 샘플입니다.",
    segments: [
      {
        id: "demo-1",
        speaker: "Speaker",
        start: 0,
        end: 5.5,
        text: "I was just wondering if you had a minute.",
        translationKo: "잠깐 시간 괜찮은지 궁금했어요.",
        noteKo: "부담을 줄여서 말을 꺼낼 때 쓰기 좋습니다."
      },
      {
        id: "demo-2",
        speaker: "Speaker",
        start: 5.5,
        end: 10.5,
        text: "Could you take a quick look at this?",
        translationKo: "이거 잠깐 봐줄 수 있어요?",
        noteKo: "가볍게 확인을 부탁하는 표현입니다."
      },
      {
        id: "demo-3",
        speaker: "Speaker",
        start: 10.5,
        end: 15.5,
        text: "I think I might need a little more time.",
        translationKo: "시간이 조금 더 필요할 것 같아요.",
        noteKo: "확정적으로 말하지 않고 완곡하게 말합니다."
      },
      {
        id: "demo-4",
        speaker: "Speaker",
        start: 15.5,
        end: 20.5,
        text: "That makes sense, but I am not totally sure yet.",
        translationKo: "말은 되는데 아직 완전히 확신은 없어요.",
        noteKo: "동의와 보류를 같이 표현합니다."
      },
      {
        id: "demo-5",
        speaker: "Speaker",
        start: 20.5,
        end: 25.5,
        text: "Let me get back to you after I check.",
        translationKo: "확인해보고 다시 말씀드릴게요.",
        noteKo: "바로 답하기 어려울 때 자연스럽습니다."
      },
      {
        id: "demo-6",
        speaker: "Speaker",
        start: 25.5,
        end: 30.5,
        text: "It depends on what you are trying to do.",
        translationKo: "무엇을 하려는지에 따라 달라요.",
        noteKo: "조건을 먼저 확인할 때 쓰기 좋습니다."
      },
      {
        id: "demo-7",
        speaker: "Speaker",
        start: 30.5,
        end: 35.5,
        text: "I would probably start with the simplest option.",
        translationKo: "저라면 아마 가장 단순한 선택지부터 시작할 것 같아요.",
        noteKo: "조언을 부드럽게 제시하는 표현입니다."
      }
    ]
  }
];
