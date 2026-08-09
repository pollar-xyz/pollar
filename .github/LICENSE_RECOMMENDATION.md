# License recommendation for Pollar

This project uses the **MIT License**. Below is a summary of why it is the recommended choice and what alternatives exist.

## Why MIT for Pollar

- **JavaScript/React ecosystem**: MIT is the most widely used license on npm and in React projects; it makes it easy for other packages and companies to depend on Pollar without legal friction.
- **Maximum adoption**: It allows commercial use, modification, distribution, and private use. It only requires preserving the copyright notice and the license.
- **Consistency**: Most of your dependencies are already MIT; using the same license simplifies license management in the monorepo.
- **Authentication SDK**: As an SDK that others will integrate into their apps (including commercial ones), a permissive license like MIT is the most suitable option.

## Alternative: Apache 2.0

If in the future you want **explicit patent protection** (patent grant and termination in case of patent claims), you could consider Apache 2.0 (as [Vercel](https://github.com/vercel/vercel) does). For an auth SDK in an early stage, MIT is usually sufficient.

## Summary

| License     | Commercial use | Modification | Patents      | Adoption in JS/React |
| ----------- | -------------- | ------------ | ------------ | -------------------- |
| **MIT**     | Yes            | Yes          | Implicit     | Very high            |
| Apache 2.0  | Yes            | Yes          | Explicit     | High                 |
| ISC         | Yes            | Yes          | Implicit     | High (similar to MIT)|

**Conclusion**: For Pollar, **MIT** is the recommended license. The [LICENSE](../LICENSE) file at the repository root is already set up with MIT. You may change the year and copyright holder name if needed.
