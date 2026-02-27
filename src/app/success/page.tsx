import SuccessClient from "./SuccessClient"

type SearchParams = Record<string, string | string[] | undefined>

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const sessionValue = params.session_id
  const orderValue = params.document_order_id

  const sessionId = Array.isArray(sessionValue) ? sessionValue[0] : sessionValue || null
  const documentOrderId = Array.isArray(orderValue) ? orderValue[0] : orderValue || null

  return <SuccessClient sessionId={sessionId} documentOrderId={documentOrderId} />
}
