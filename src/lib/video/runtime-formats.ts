/** Software readers, not model capabilities or evidence of supplier support.
 * Zero denotes the unversioned historical envelope. Release tooling binds this
 * descriptor to an immutable bundle; it never grants task replay permission. */
export const videoRuntimeFormats=Object.freeze({
 schemaVersion:1,
 taskParameterVersions:Object.freeze([0,2,3] as const),
 compiledPlanVersions:Object.freeze([1,2,3,4,5] as const),
 workflowExecutionVersions:Object.freeze([0,1] as const),
 workflowCompiledVersions:Object.freeze([1] as const),
 publishedProfileVersions:Object.freeze({'json-video':1,'native-video':1,'workflow-video':1}),
});
