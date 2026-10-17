import PrepOverview from "./PrepOverview"
import type { SharedTabData } from "./sharedTabs"

export default function MainTab(data: SharedTabData) {
  return <PrepOverview {...data} questionsStatus={null} conceptsStatus={null} extraTiles={null} progress={null} />
}
