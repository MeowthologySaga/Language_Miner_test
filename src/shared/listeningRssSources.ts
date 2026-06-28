export type ListeningRssSource = {
  id: string;
  label: string;
  channelName: string;
  channelId: string;
  topicLabel: string;
  languageCode: string;
};

export const listeningRssSources: ListeningRssSource[] = [
  {
    id: "ted-ed",
    label: "TED-Ed",
    channelName: "TED-Ed",
    channelId: "UCsooa4yRKGN_zEE8iknghZA",
    topicLabel: "science",
    languageCode: "en"
  },
  {
    id: "kurzgesagt",
    label: "Kurzgesagt",
    channelName: "Kurzgesagt - In a Nutshell",
    channelId: "UCsXVk37bltHxD1rDPwtNM8Q",
    topicLabel: "science",
    languageCode: "en"
  },
  {
    id: "national-geographic",
    label: "National Geographic",
    channelName: "National Geographic",
    channelId: "UCpVm7bg6pXKo1Pr6k5kxG9A",
    topicLabel: "documentary",
    languageCode: "en"
  },
  {
    id: "veritasium",
    label: "Veritasium",
    channelName: "Veritasium",
    channelId: "UCHnyfMqiRRG1u-2MsSQLbXA",
    topicLabel: "science",
    languageCode: "en"
  },
  {
    id: "vox",
    label: "Vox",
    channelName: "Vox",
    channelId: "UCLXo7UDZvByw2ixzpQCufnA",
    topicLabel: "explainer",
    languageCode: "en"
  },
  {
    id: "crash-course",
    label: "CrashCourse",
    channelName: "CrashCourse",
    channelId: "UCX6b17PVsYBQ0ip5gyeme-Q",
    topicLabel: "education",
    languageCode: "en"
  },
  {
    id: "ann-news",
    label: "ANNnewsCH",
    channelName: "ANNnewsCH",
    channelId: "UCGCZAYq5Xxojl_tSXcVJhiQ",
    topicLabel: "news",
    languageCode: "ja"
  },
  {
    id: "fnn-prime-online",
    label: "FNNプライムオンライン",
    channelName: "FNNプライムオンライン",
    channelId: "UCoQBJMzcwmXrRSHBFAlTsIw",
    topicLabel: "news",
    languageCode: "ja"
  },
  {
    id: "tvtokyo-biz",
    label: "テレ東BIZ",
    channelName: "テレ東BIZ",
    channelId: "UCkKVQ_GNjd8FbAuT6xDcWgg",
    topicLabel: "business",
    languageCode: "ja"
  },
  {
    id: "kbs-news",
    label: "KBS News",
    channelName: "KBS News",
    channelId: "UCcQTRi69dsVYHN3exePtZ1A",
    topicLabel: "news",
    languageCode: "ko"
  },
  {
    id: "mbc-news",
    label: "MBCNEWS",
    channelName: "MBCNEWS",
    channelId: "UCF4Wxdo3inmxP-Y59wXDsFw",
    topicLabel: "news",
    languageCode: "ko"
  },
  {
    id: "sbs-news",
    label: "SBS 뉴스",
    channelName: "SBS 뉴스",
    channelId: "UCkinYTS9IHqOEwR1Sze2JTw",
    topicLabel: "news",
    languageCode: "ko"
  }
];

export function getListeningRssSourcesForLanguage(languageCode?: string) {
  const normalizedLanguageCode = languageCode?.trim().toLowerCase().split("-")[0];
  if (!normalizedLanguageCode) {
    return listeningRssSources;
  }
  return listeningRssSources.filter((source) => source.languageCode === normalizedLanguageCode);
}

export function getYouTubeRssFeedUrl(channelId: string) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}
