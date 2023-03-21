import { ActionButton, DefaultButton, Spinner, Stack } from '@fluentui/react';
import { observer } from 'mobx-react-lite';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import produce from 'immer';
import { useGlobalStore } from '../../../../store';
import type { IFunctionalDep } from '../../config';
import { getI18n } from '../../locales';
import { getGeneratedFDFromAutoDetection } from './utils';
import FDEditor from './FDEditor';

// nothing

const Mask = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    z-index: 9999;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #fff8;
    > div {
        box-shadow: 0 0 12px rgba(0, 0, 0, 0.15), 0 0 8px rgba(0, 0, 0, 0.03);
        background-color: #fff;
        padding: 2em;
        > div.container {
            width: 600px;
            > * {
                width: 100%;
            }
        }
    }
`;

enum BatchUpdateMode {
    OVERWRITE_ONLY = 'overwrite_only',
    FILL_ONLY = 'fill_only',
    FULLY_REPLACE = 'fully_replace',
}

const dropdownOptions: readonly BatchUpdateMode[] = [
    BatchUpdateMode.OVERWRITE_ONLY,
    BatchUpdateMode.FILL_ONLY,
    BatchUpdateMode.FULLY_REPLACE,
];

const FDBatch: FC = () => {
    const { causalStore } = useGlobalStore();
    const { sample } = causalStore.dataset;
    const { functionalDependencies } = causalStore.model;
    const { serverActive } = causalStore.operator;
    const [displayPreview, setDisplayPreview] = useState(false);
    const [preview, setPreview] = useState<readonly IFunctionalDep[] | null>(null);
    const isPending = displayPreview && preview === null;
    const [mode, setMode] = useState(BatchUpdateMode.OVERWRITE_ONLY);

    const updatePreview = useMemo<(fdArr: IFunctionalDep[] | ((prev: readonly IFunctionalDep[] | null) => readonly IFunctionalDep[])) => void>(() => {
        if (displayPreview) {
            return setPreview;
        }
        return () => {};
    }, [displayPreview]);

    const generateFDFromExtInfo = useCallback(() => {
        setPreview(causalStore.model.generatedFDFromExtInfo);
        setDisplayPreview(true);
    }, [causalStore]);

    const pendingRef = useRef<Promise<unknown>>();
    useEffect(() => {
        if (!displayPreview) {
            pendingRef.current = undefined;
        }
    }, [displayPreview]);
    const generateFDFromAutoDetection = useCallback(() => {
        const p = sample.getAll().then(data => getGeneratedFDFromAutoDetection(data));
        pendingRef.current = p;
        p.then(res => {
            if (p === pendingRef.current) {
                setPreview(res);
            }
        }).catch(err => {
            if (p === pendingRef.current) {
                setPreview([]);
            }
            console.warn(err);
        }).finally(() => {
            pendingRef.current = undefined;
        });
        setDisplayPreview(true);
    }, [sample]);

    const handleClear = useCallback(() => {
        causalStore.model.updateFunctionalDependencies([]);
    }, [causalStore]);

    const submittable = useMemo<IFunctionalDep[]>(() => {
        if (preview) {
            switch (mode) {
                case BatchUpdateMode.OVERWRITE_ONLY: {
                    return preview.reduce<IFunctionalDep[]>((deps, dep) => {
                        const overloadIdx = deps.findIndex(which => which.fid === dep.fid);
                        if (overloadIdx !== -1) {
                            return produce(deps, draft => {
                                draft.splice(overloadIdx, 1, dep);
                            });
                        }
                        return deps.concat([dep]);
                    }, functionalDependencies.slice(0));
                }
                case BatchUpdateMode.FILL_ONLY: {
                    return preview.reduce<IFunctionalDep[]>((deps, dep) => {
                        const overloadIdx = deps.findIndex(which => which.fid === dep.fid);
                        if (overloadIdx !== -1) {
                            return produce(deps, draft => {
                                const overload = draft[overloadIdx];
                                for (const prm of dep.params) {
                                    if (!overload.params.some(p => p.fid === prm.fid)) {
                                        overload.params.push(prm);
                                    }
                                }
                            });
                        }
                        return deps;
                    }, functionalDependencies.slice(0));
                }
                case BatchUpdateMode.FULLY_REPLACE: {
                    return preview.slice(0);
                }
                default: {
                    return functionalDependencies.slice(0);
                }
            }
        } else {
            return functionalDependencies.slice(0);
        }
    }, [preview, functionalDependencies, mode]);
    
    const handleSubmit = useCallback(() => {
        causalStore.model.updateFunctionalDependencies(submittable);
        setDisplayPreview(false);
        setPreview(null);
    }, [causalStore, submittable]);

    const handleCancel = useCallback(() => {
        setPreview(null);
        setDisplayPreview(false);
    }, []);

    return (
        <>
            <h3>{getI18n('fd_config.batch.title')}</h3>
            <Stack tokens={{ childrenGap: 10 }} horizontal>
                <ActionButton iconProps={{ iconName: 'Delete' }} onClick={handleClear}>
                    {getI18n('fd_config.batch.delete_all')}
                </ActionButton>
                <ActionButton iconProps={{ iconName: 'EngineeringGroup' }} onClick={generateFDFromExtInfo}>
                    {getI18n('fd_config.batch.from_ext')}
                </ActionButton>
                {/* <ActionButton iconProps={{ iconName: 'ConfigurationSolid' }} disabled>
                    导入影响关系
                </ActionButton> */}
                <ActionButton iconProps={{ iconName: 'HintText' }} disabled={!serverActive} onClick={generateFDFromAutoDetection}>
                    {getI18n('fd_config.batch.from_detection')}
                </ActionButton>
            </Stack>
            {displayPreview && (
                <Mask>
                    <div>
                        <div className="container">
                            {isPending ? (
                                <Spinner label={getI18n('computing')} />
                            ) : (
                                <FDEditor
                                    title={getI18n('fd_config.batch.preview')}
                                    functionalDependencies={submittable}
                                    setFunctionalDependencies={updatePreview}
                                />
                            )}
                        </div>
                        <Stack tokens={{ childrenGap: 20 }} horizontal style={{ justifyContent: 'center' }}>
                            <DefaultButton
                                text={getI18n(`fd_config.batch_mode.${mode}`)}
                                onClick={handleSubmit}
                                primary
                                split
                                menuProps={{
                                    items: dropdownOptions.map(key => ({ key, text: getI18n(`fd_config.batch_mode.${key}`) })),
                                    onItemClick: (_e, item) => {
                                        if (item) {
                                            setMode(item.key as BatchUpdateMode);
                                        }
                                    },
                                }}
                            />
                            <DefaultButton
                                text={getI18n('fd_config.batch.cancel')}
                                onClick={handleCancel}
                            />
                        </Stack>
                    </div>
                </Mask>
            )}
        </>
    );
};

export default observer(FDBatch);
