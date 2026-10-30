export const contextFields = `
  id number url state headRefOid baseRefOid headRefName baseRefName
  repository { nameWithOwner }
`;
export const commentFields = `
  id body url updatedAt state viewerDidAuthor author { login } replyTo { id }
  commit { oid } originalCommit { oid }
`;
const pageInfo = "totalCount pageInfo { hasNextPage endCursor }";
const threadFields = `
  id path line originalLine isResolved isOutdated viewerCanReply viewerCanResolve
`;
const comments = (after: string): string => `
  comments(first: 100${after}) { ${pageInfo} nodes { ${commentFields} } }
`;
const prQuery = (name: string, selection: string): string => `
  query ${name}($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    viewer { login }
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { ${contextFields} ${selection} }
    }
  }
`;
export const threadsQuery = prQuery(
  "FeedbackThreads",
  `
  reviewThreads(first: 100, after: $cursor) {
    ${pageInfo} nodes { ${threadFields} ${comments("")} }
  }
`,
);
export const reviewsQuery = prQuery(
  "FeedbackReviews",
  `
  reviews(first: 100, after: $cursor) {
    ${pageInfo} nodes { id body url state submittedAt author { login } commit { oid } }
  }
`,
);
export const discussionQuery = prQuery(
  "FeedbackDiscussion",
  `
  comments(first: 100, after: $cursor) {
    ${pageInfo} nodes { id body url updatedAt author { login } }
  }
`,
);
// Context has no cursor variable: GraphQL rejects declared-but-unused variables.
export const contextQuery = `
  query ResponseContext($owner: String!, $name: String!, $number: Int!) {
    viewer { login }
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { ${contextFields} }
    }
  }
`;
export const threadQuery = `
  query ReviewThread($id: ID!, $cursor: String) {
    viewer { login }
    node(id: $id) {
      ... on PullRequestReviewThread {
        ${threadFields} ${comments(", after: $cursor")}
        pullRequest { ${contextFields} }
      }
    }
  }
`;

export const replyMutation = `
  mutation ReplyToReviewThread($input: AddPullRequestReviewThreadReplyInput!) {
    addPullRequestReviewThreadReply(input: $input) {
      comment { id body url state viewerDidAuthor }
    }
  }
`;
export const resolveMutation = `
  mutation ResolveReviewThread($input: ResolveReviewThreadInput!) {
    resolveReviewThread(input: $input) { thread { id isResolved } }
  }
`;
